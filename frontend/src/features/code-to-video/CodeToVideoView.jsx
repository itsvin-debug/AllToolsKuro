/**
 * Kuro Studio - Code to Video Studio v4
 * Claude-Grade Direct GPU Live Preview + 100% Deterministic 60 FPS WebCodecs HD Video Renderer.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Palette,
  Wand2,
  Layers,
  FolderArchive,
  FileCode2,
  Save
} from 'lucide-react';
import {
  CODE_TEMPLATES,
  buildCompositeHtml
} from './codeToVideoTemplates';
import {
  CodeToVideoCompositor,
  computeTargetDimensions,
  getVirtualStageSize,
  exportVideo,
  compileUniversalCode,
  detectCodeLanguage,
  findPrimaryCanvas,
  BITRATE_PRESETS
} from './codeToVideoEngine';
import {
  QUICK_PROMPT_SAMPLES,
  PROMPT_VISUAL_STYLES,
  PROMPT_COLOR_MOODS,
  compileTextPromptToSceneGraph
} from './textPromptCompiler';
import {
  exportAlightMotionXML,
  exportCapCutBundleZip,
  exportFcpxmlBundleZip,
  exportKuroStudioProjectJson,
  parseKuroStudioProjectJson
} from './projectExporter';

export default function CodeToVideoView({ onBack, onShowToast, lang = 'id' }) {
  // --- TEMPLATE, TAB EDITOR UNIVERSAL & EDITOR TEKS ---
  const [selectedTemplateId, setSelectedTemplateId] = useState('promo-ad');
  const [editorTab, setEditorTab] = useState('code'); // 'code' | 'text'

  // Kode tunggal universal (otomatis mendeteksi HTML, SVG, CSS, GLSL, atau JS)
  const [universalCode, setUniversalCode] = useState(() => {
    return (
      localStorage.getItem('kuro_c2v_universal_code') ||
      localStorage.getItem('kuro_c2v_code_all') ||
      buildCompositeHtml(CODE_TEMPLATES[0].html, CODE_TEMPLATES[0].css, CODE_TEMPLATES[0].js)
    );
  });

  // Konfigurasi Editor Teks Berbasis Prompt Ide Bebas
  const [textPrompt, setTextPrompt] = useState(() => {
    return localStorage.getItem('kuro_c2v_text_prompt') || QUICK_PROMPT_SAMPLES[0].prompt;
  });
  const [promptOptions, setPromptOptions] = useState(() => {
    try {
      const saved = localStorage.getItem('kuro_c2v_prompt_options');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { visualStyle: 'auto', mood: 'auto' };
  });

  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [errorLog, setErrorLog] = useState(null);

  // --- SETTINGS (SYNCHRONIZED VIA settingsRef) ---
  const [settings, setSettings] = useState(() => {
    return {
      stage3d: false, // Default: OFF (100% Full Layar Sinematik Murni Direct GPU)
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
  const [bundleExportState, setBundleExportState] = useState({
    active: false,
    label: '',
    percent: 0
  });

  // Dimensi virtual HD tetap & faktor skala CSS agar Live Preview selalu tajam di HP & desktop
  const virtualDims = useMemo(() => getVirtualStageSize(exportAspect), [exportAspect]);
  const [stageScale, setStageScale] = useState(1);

  // Kompilasi SceneGraph & HTML animasi otomatis dari prompt Editor Teks
  const compiledPrompt = useMemo(() => {
    const dur = Math.max(2, Math.min(Number(exportDuration) || 10, 60));
    return compileTextPromptToSceneGraph(textPrompt, promptOptions, dur);
  }, [textPrompt, promptOptions, exportDuration]);

  // --- REFS ---
  const liveIframeRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const stageOuterRef = useRef(null);
  const compositorRef = useRef(null);
  const animationFrameId = useRef(null);
  const startTimeRef = useRef(performance.now());
  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const lastRenderSignatureRef = useRef('');

  // Auto-save kode universal & prompt Editor Teks ke storage
  useEffect(() => {
    try {
      localStorage.setItem('kuro_c2v_universal_code', universalCode);
    } catch {}
  }, [universalCode]);

  useEffect(() => {
    try {
      localStorage.setItem('kuro_c2v_text_prompt', textPrompt);
    } catch {}
  }, [textPrompt]);

  useEffect(() => {
    try {
      localStorage.setItem('kuro_c2v_prompt_options', JSON.stringify(promptOptions));
    } catch {}
  }, [promptOptions]);

  // Helper resolusi kode sumber aktif sesuai tab Editor Kode / Editor Teks
  const getActiveSourceCode = useCallback(() => {
    if (editorTab === 'text') {
      return compiledPrompt.generatedHtmlCode;
    }
    return universalCode;
  }, [editorTab, compiledPrompt.generatedHtmlCode, universalCode]);

  // Status pasif auto-detect jenis bahasa kode
  const detectedLanguage = useMemo(() => {
    if (editorTab === 'text') {
      return { category: 'text-prompt', label: `Teks (${compiledPrompt.summary.topicLabel})` };
    }
    return detectCodeLanguage(universalCode);
  }, [editorTab, compiledPrompt.summary.topicLabel, universalCode]);

  // ResizeObserver agar panggung virtual HD terskala presisi ke lebar kontainer HP maupun desktop
  useEffect(() => {
    const outerEl = stageOuterRef.current;
    if (!outerEl) return undefined;

    const recalcScale = () => {
      const rect = outerEl.getBoundingClientRect();
      if (rect.width > 16 && rect.height > 16) {
        const nextScale = Math.min(rect.width / virtualDims.width, rect.height / virtualDims.height);
        setStageScale(Math.max(0.1, Number(nextScale.toFixed(4))));
      }
    };

    recalcScale();
    const rafId = requestAnimationFrame(recalcScale);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recalcScale) : null;
    if (ro) ro.observe(outerEl);
    window.addEventListener('resize', recalcScale);

    return () => {
      cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', recalcScale);
    };
  }, [virtualDims.width, virtualDims.height, mobileSection, isFullscreen]);

  // Inisialisasi Engine Compositor & Live Preview Iframe
  useEffect(() => {
    const initialDims = getVirtualStageSize(exportAspect);
    const comp = new CodeToVideoCompositor(canvasRef.current, initialDims.width, initialDims.height);
    compositorRef.current = comp;

    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = initialDims.width;
      overlayCanvasRef.current.height = initialDims.height;
    }

    // Suntikkan kode awal ke Live Iframe pada resolusi panggung virtual penuh
    if (liveIframeRef.current) {
      liveIframeRef.current.srcdoc = compileUniversalCode(getActiveSourceCode(), 'live', {
        width: initialDims.width,
        height: initialDims.height
      });
    }

    startTimeRef.current = performance.now();

    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    // Loop animasi live preview Direct GPU
    const loop = (now) => {
      if (isPlaying && compositorRef.current) {
        const curSettings = settingsRef.current;
        const spd = curSettings.motionSpeed || 1.0;
        const elapsed = ((now - startTimeRef.current) / 1000) * spd;

        if (!curSettings.stage3d) {
          if (overlayCanvasRef.current) {
            const oCanvas = overlayCanvasRef.current;
            const oCtx = oCanvas.getContext('2d');
            compositorRef.current.renderOverlayOnly(oCtx, oCanvas.width, oCanvas.height, elapsed, curSettings);
          }
        } else {
          try {
            const doc = liveIframeRef.current?.contentDocument || liveIframeRef.current?.contentWindow?.document;
            if (doc) {
              const innerCanvas = findPrimaryCanvas(doc);
              if (innerCanvas && innerCanvas.width > 0 && innerCanvas.height > 0) {
                compositorRef.current.codeCtx.clearRect(0, 0, compositorRef.current.width, compositorRef.current.height);
                compositorRef.current.codeCtx.drawImage(innerCanvas, 0, 0, compositorRef.current.width, compositorRef.current.height);
                compositorRef.current.codeTexture.needsUpdate = true;
              }
            }
          } catch {}

          compositorRef.current.renderFrame(elapsed, curSettings);
        }

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
      if (compositorRef.current) compositorRef.current.dispose();
    };
  }, []);

  // Sinkronisasi state fullscreen bila ditutup lewat tombol ESC
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Tangkap error runtime dari live preview iframe
  useEffect(() => {
    const handleMsg = (e) => {
      if (e.data?.type === 'ctv-error') {
        setErrorLog(e.data.error);
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, []);

  // Update dimensi panggung virtual saat rasio aspek berubah
  useEffect(() => {
    if (!compositorRef.current) return;
    compositorRef.current.resize(virtualDims.width, virtualDims.height);
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = virtualDims.width;
      overlayCanvasRef.current.height = virtualDims.height;
    }
    try {
      liveIframeRef.current?.contentWindow?.dispatchEvent(new Event('resize'));
    } catch {}
  }, [virtualDims.width, virtualDims.height]);

  // Update pratinjau otomatis (debounce 280ms) saat mengetik di Editor Teks
  useEffect(() => {
    if (editorTab !== 'text') return undefined;
    const timer = setTimeout(() => {
      setErrorLog(null);
      if (liveIframeRef.current) {
        liveIframeRef.current.srcdoc = compileUniversalCode(compiledPrompt.generatedHtmlCode, 'live', {
          width: virtualDims.width,
          height: virtualDims.height
        });
      }
      startTimeRef.current = performance.now();
      setIsPlaying(true);
    }, 280);
    return () => clearTimeout(timer);
  }, [editorTab, compiledPrompt.generatedHtmlCode, virtualDims.width, virtualDims.height]);

  // Terapkan perubahan kode atau prompt teks ke Live Iframe
  const handleApplyCode = useCallback(() => {
    const targetCode = getActiveSourceCode();
    setErrorLog(null);

    if (liveIframeRef.current) {
      liveIframeRef.current.srcdoc = compileUniversalCode(targetCode, 'live', {
        width: virtualDims.width,
        height: virtualDims.height
      });
    }

    startTimeRef.current = performance.now();
    setIsPlaying(true);
    onShowToast?.('Pratinjau visual berhasil diperbarui.', 'success');
  }, [getActiveSourceCode, virtualDims.width, virtualDims.height, onShowToast]);

  const handleGeneratePromptAnimation = () => {
    setErrorLog(null);
    const dur = Math.max(2, Math.min(Number(exportDuration) || 10, 60));
    const fresh = compileTextPromptToSceneGraph(textPrompt, promptOptions, dur);
    if (liveIframeRef.current) {
      liveIframeRef.current.srcdoc = compileUniversalCode(fresh.generatedHtmlCode, 'live', {
        width: virtualDims.width,
        height: virtualDims.height
      });
    }
    startTimeRef.current = performance.now();
    setIsPlaying(true);
    onShowToast?.(`Animasi dibuat: ${fresh.summary.topicLabel} (${fresh.summary.colorName}).`, 'success');
  };

  // Konversi hasil Editor Teks menjadi kode HTML5 utuh di Editor Kode
  const handleOpenTextInCodeEditor = () => {
    const generatedHtml = compiledPrompt.generatedHtmlCode;
    setUniversalCode(generatedHtml);
    setEditorTab('code');
    setErrorLog(null);
    if (liveIframeRef.current) {
      liveIframeRef.current.srcdoc = compileUniversalCode(generatedHtml, 'live', {
        width: virtualDims.width,
        height: virtualDims.height
      });
    }
    startTimeRef.current = performance.now();
    setIsPlaying(true);
    onShowToast?.('Animasi teks dibuka ke Editor Kode.', 'success');
  };

  // Ganti Template Preset
  const handleSelectTemplate = (templateId) => {
    const tmpl = CODE_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;

    setSelectedTemplateId(templateId);
    setEditorTab('code');
    setSettings((prev) => ({
      ...prev,
      ...tmpl.defaults
    }));
    setErrorLog(null);

    const nextCode =
      tmpl.category === 'canvas'
        ? tmpl.code
        : buildCompositeHtml(tmpl.html, tmpl.css, tmpl.js);

    setUniversalCode(nextCode);
    if (liveIframeRef.current) {
      liveIframeRef.current.srcdoc = compileUniversalCode(nextCode, 'live', {
        width: virtualDims.width,
        height: virtualDims.height
      });
    }

    startTimeRef.current = performance.now();
    setIsPlaying(true);
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
      await navigator.clipboard.writeText(getActiveSourceCode());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShowToast?.('Kode berhasil disalin.', 'success');
    } catch {
      onShowToast?.('Gagal menyalin kode.', 'error');
    }
  };

  // Reset Kode / Teks
  const handleResetCode = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    if (editorTab === 'text') {
      setTextPrompt(QUICK_PROMPT_SAMPLES[0].prompt);
      setPromptOptions({ visualStyle: 'auto', mood: 'auto' });
      onShowToast?.('Prompt Editor Teks dikembalikan ke bawaan.', 'info');
    } else {
      const currentTmpl = CODE_TEMPLATES.find((t) => t.id === selectedTemplateId) || CODE_TEMPLATES[0];
      handleSelectTemplate(currentTmpl.id);
      onShowToast?.('Kode direset ke bawaan template.', 'info');
    }
    setConfirmReset(false);
  };

  // Ekspor File Kode
  const handleExportCodeFile = () => {
    const activeCode = getActiveSourceCode();
    const { category } = detectCodeLanguage(activeCode);
    const ext =
      category === 'pure-js-standalone' || category === 'pure-js-draw'
        ? 'js'
        : category === 'pure-css'
        ? 'css'
        : category === 'pure-svg'
        ? 'svg'
        : category === 'glsl-shader'
        ? 'glsl'
        : 'html';
    const blob = new Blob([activeCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kuro_studio_${selectedTemplateId}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast?.(`Berkas kuro_studio_${selectedTemplateId}.${ext} diunduh.`, 'success');
  };

  // Impor File Kode atau Cadangan Proyek Studio (.kurovid.json)
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content !== 'string') return;

      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.json')) {
        try {
          const restored = parseKuroStudioProjectJson(content);
          if (restored.selectedTemplateId) setSelectedTemplateId(restored.selectedTemplateId);
          if (restored.universalCode) setUniversalCode(restored.universalCode);
          if (restored.promptInput) setTextPrompt(restored.promptInput);
          if (restored.promptOptions) setPromptOptions(restored.promptOptions);
          if (restored.settings) setSettings((s) => ({ ...s, ...restored.settings }));
          if (restored.exportOptions) {
            if (restored.exportOptions.res) setExportRes(restored.exportOptions.res);
            if (restored.exportOptions.aspect) setExportAspect(restored.exportOptions.aspect);
            if (restored.exportOptions.fps) setExportFps(Number(restored.exportOptions.fps));
            if (restored.exportOptions.duration) setExportDuration(Number(restored.exportOptions.duration));
            if (restored.exportOptions.bitrate) setExportBitrate(restored.exportOptions.bitrate);
          }
          setEditorTab(restored.editorTab);
          setErrorLog(null);

          const durRestore = Number(restored.exportOptions?.duration) || Number(exportDuration) || 10;
          const aspectRestore = restored.exportOptions?.aspect || exportAspect;
          const vDims = getVirtualStageSize(aspectRestore);
          const nextHtml = restored.editorTab === 'text'
            ? compileTextPromptToSceneGraph(restored.promptInput || textPrompt, restored.promptOptions, durRestore).generatedHtmlCode
            : restored.universalCode || universalCode;
          if (liveIframeRef.current) {
            liveIframeRef.current.srcdoc = compileUniversalCode(nextHtml, 'live', {
              width: vDims.width,
              height: vDims.height
            });
          }
          startTimeRef.current = performance.now();
          setIsPlaying(true);
          onShowToast?.(`Proyek "${file.name}" berhasil dipulihkan.`, 'success');
        } catch (err) {
          onShowToast?.(err.message || 'Gagal membaca file proyek JSON.', 'error');
        }
        return;
      }

      setEditorTab('code');
      setUniversalCode(content);
      setErrorLog(null);
      if (liveIframeRef.current) {
        liveIframeRef.current.srcdoc = compileUniversalCode(content, 'live', {
          width: virtualDims.width,
          height: virtualDims.height
        });
      }
      startTimeRef.current = performance.now();
      setIsPlaying(true);
      onShowToast?.(`Berkas "${file.name}" berhasil diimpor.`, 'success');
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

  // Controls Player (Direct message to Live Iframe tanpa reload)
  const handleTogglePlay = () => {
    setIsPlaying((prev) => {
      const next = !prev;
      try {
        liveIframeRef.current?.contentWindow?.postMessage({
          type: next ? 'ctv-live-resume' : 'ctv-live-pause'
        }, '*');
      } catch {}
      return next;
    });
  };

  const handleRestart = () => {
    startTimeRef.current = performance.now();
    setIsPlaying(true);
    try {
      liveIframeRef.current?.contentWindow?.postMessage({
        type: 'ctv-live-restart'
      }, '*');
    } catch {}
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

  const buildRenderSignature = useCallback(
    (sourceCode) => `${editorTab}|${exportRes}|${exportAspect}|${exportFps}|${exportDuration}|${exportBitrate}|${JSON.stringify(settingsRef.current)}|${sourceCode.length}:${sourceCode.slice(0, 64)}`,
    [editorTab, exportRes, exportAspect, exportFps, exportDuration, exportBitrate]
  );

  // --- MULAI RENDER VIDEO DETERMINISTIK 60 FPS ---
  const handleStartRender = async () => {
    if (!compositorRef.current) return;

    setIsPlaying(false);
    try {
      liveIframeRef.current?.contentWindow?.postMessage({ type: 'ctv-live-pause' }, '*');
    } catch {}

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

    const targetCode = getActiveSourceCode();
    const finalDuration = Math.max(1, Math.min(Number(exportDuration) || 10, 60));

    try {
      const result = await exportVideo({
        compositor: compositorRef.current,
        code: targetCode,
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

      lastRenderSignatureRef.current = buildRenderSignature(targetCode);
      setRenderResult(result);
      onShowToast?.(`Video ${result.format.toUpperCase()} berhasil dirender (${result.sizeMB} MB)!`, 'success');

      if (autoDownload && result.url) {
        const a = document.createElement('a');
        a.href = result.url;
        a.download = `KuroStudio_${result.width}x${result.height}_${Date.now()}.${result.format}`;
        a.click();
      }
    } catch (err) {
      if (abortController.signal.aborted) {
        onShowToast?.('Proses render dibatalkan oleh pengguna.', 'info');
      } else {
        onShowToast?.(`Gagal render: ${err.message}`, 'error');
      }
    } finally {
      setIsRendering(false);
      abortControllerRef.current = null;

      compositorRef.current.resize(virtualDims.width, virtualDims.height);
    }
  };

  const handleCancelRender = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
  };

  const handleDownloadVideo = () => {
    if (!renderResult?.url) return;
    const a = document.createElement('a');
    a.href = renderResult.url;
    a.download = `KuroStudio_${renderResult.width}x${renderResult.height}_${Date.now()}.${renderResult.format}`;
    a.click();
    onShowToast?.('Mengunduh video...', 'success');
  };

  const triggerBlobDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  };

  const activeSceneTitle = useMemo(() => {
    if (editorTab === 'text') return compiledPrompt.summary.headline || 'Kuro Text Studio';
    const tmpl = CODE_TEMPLATES.find((t) => t.id === selectedTemplateId);
    return settings.hudTitle || tmpl?.name || 'Kuro Code Studio';
  }, [editorTab, compiledPrompt.summary.headline, selectedTemplateId, settings.hudTitle]);

  const handleExportAlightMotion = () => {
    const dur = Math.max(1, Math.min(Number(exportDuration) || 10, 60));
    const dims = computeTargetDimensions(exportRes, exportAspect);
    const { blob, filename } = exportAlightMotionXML({
      sceneGraph: editorTab === 'text' ? compiledPrompt.sceneGraph : null,
      title: activeSceneTitle,
      width: dims.width,
      height: dims.height,
      fps: exportFps,
      duration: dur
    });
    triggerBlobDownload(blob, filename);
    onShowToast?.(`File Alight Motion (${filename}) berhasil diunduh.`, 'success');
  };

  const renderDualVideoAssetsForBundle = async (bundleTitleLabel) => {
    if (!compositorRef.current) throw new Error('Compositor studio belum siap.');
    const sourceCode = getActiveSourceCode();
    const sig = buildRenderSignature(sourceCode);
    const finalDuration = Math.max(1, Math.min(Number(exportDuration) || 10, 60));

    setIsPlaying(false);
    try {
      liveIframeRef.current?.contentWindow?.postMessage({ type: 'ctv-live-pause' }, '*');
    } catch {}

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let finalResObj = renderResult && lastRenderSignatureRef.current === sig ? renderResult : null;

    try {
      if (!finalResObj) {
        setBundleExportState({
          active: true,
          label: `${bundleTitleLabel}: Merender Video Final (1/2)...`,
          percent: 5
        });
        finalResObj = await exportVideo({
          compositor: compositorRef.current,
          code: sourceCode,
          settings: settingsRef.current,
          resolution: exportRes,
          aspectRatio: exportAspect,
          fps: exportFps,
          duration: finalDuration,
          bitratePreset: exportBitrate,
          signal: abortController.signal,
          onProgress: (p) => {
            setBundleExportState({
              active: true,
              label: `${bundleTitleLabel}: Video Final (${p.percent}%)`,
              percent: Math.round(p.percent * 0.45)
            });
          }
        });
        lastRenderSignatureRef.current = sig;
        setRenderResult(finalResObj);
      }

      setBundleExportState({
        active: true,
        label: `${bundleTitleLabel}: Merender Latar Polos Tanpa Teks (2/2)...`,
        percent: 50
      });

      const cleanCode = editorTab === 'text' ? compiledPrompt.generatedCleanBgHtmlCode : sourceCode;
      const cleanResObj = await exportVideo({
        compositor: compositorRef.current,
        code: cleanCode,
        settings: { ...settingsRef.current, hudEnabled: false },
        resolution: exportRes,
        aspectRatio: exportAspect,
        fps: exportFps,
        duration: finalDuration,
        bitratePreset: exportBitrate,
        cleanBg: editorTab !== 'text',
        signal: abortController.signal,
        onProgress: (p) => {
          setBundleExportState({
            active: true,
            label: `${bundleTitleLabel}: Video Latar Polos (${p.percent}%)`,
            percent: 50 + Math.round(p.percent * 0.4)
          });
        }
      });

      return { finalResObj, cleanResObj, finalDuration };
    } finally {
      abortControllerRef.current = null;
      compositorRef.current.resize(virtualDims.width, virtualDims.height);
    }
  };

  const handleExportCapCutBundle = async () => {
    if (isRendering || bundleExportState.active) return;
    try {
      const { finalResObj, cleanResObj, finalDuration } = await renderDualVideoAssetsForBundle('Paket CapCut');
      setBundleExportState({ active: true, label: 'Mengemas ZIP CapCut (PNG + SRT + Draft)...', percent: 94 });
      const { blob, filename } = await exportCapCutBundleZip({
        finalVideoBlob: finalResObj.blob,
        cleanBgVideoBlob: cleanResObj.blob,
        videoExt: finalResObj.format,
        sceneGraph: editorTab === 'text' ? compiledPrompt.sceneGraph : null,
        title: activeSceneTitle,
        width: finalResObj.width,
        height: finalResObj.height,
        fps: exportFps,
        duration: finalDuration
      });
      triggerBlobDownload(blob, filename);
      onShowToast?.(`Paket CapCut (${filename}) siap diunduh!`, 'success');
    } catch (err) {
      if (!err?.message?.includes('dibatalkan')) {
        onShowToast?.(`Gagal ekspor paket CapCut: ${err.message}`, 'error');
      }
    } finally {
      setBundleExportState({ active: false, label: '', percent: 0 });
    }
  };

  const handleExportFcpxmlBundle = async () => {
    if (isRendering || bundleExportState.active) return;
    try {
      const { finalResObj, cleanResObj, finalDuration } = await renderDualVideoAssetsForBundle('Paket FCPXML');
      setBundleExportState({ active: true, label: 'Mengemas ZIP Timeline FCPXML v1.9...', percent: 94 });
      const { blob, filename } = await exportFcpxmlBundleZip({
        finalVideoBlob: finalResObj.blob,
        cleanBgVideoBlob: cleanResObj.blob,
        videoExt: finalResObj.format,
        sceneGraph: editorTab === 'text' ? compiledPrompt.sceneGraph : null,
        title: activeSceneTitle,
        width: finalResObj.width,
        height: finalResObj.height,
        fps: exportFps,
        duration: finalDuration
      });
      triggerBlobDownload(blob, filename);
      onShowToast?.(`Paket FCPXML (${filename}) berhasil diunduh.`, 'success');
    } catch (err) {
      if (!err?.message?.includes('dibatalkan')) {
        onShowToast?.(`Gagal ekspor FCPXML: ${err.message}`, 'error');
      }
    } finally {
      setBundleExportState({ active: false, label: '', percent: 0 });
    }
  };

  const handleExportProjectJson = () => {
    const { blob, filename } = exportKuroStudioProjectJson({
      editorTab,
      selectedTemplateId,
      universalCode,
      promptInput: textPrompt,
      promptOptions,
      settings: settingsRef.current,
      exportOptions: {
        res: exportRes,
        aspect: exportAspect,
        fps: exportFps,
        duration: exportDuration,
        bitrate: exportBitrate
      }
    });
    triggerBlobDownload(blob, filename);
    onShowToast?.(`Cadangan proyek (${filename}) disimpan.`, 'success');
  };

  // Ringkasan real-time
  const targetDims = computeTargetDimensions(exportRes, exportAspect);
  const activeBitrateVal = BITRATE_PRESETS[exportBitrate] || 16_000_000;
  const estimatedMB = (((activeBitrateVal * (Number(exportDuration) || 10)) / 8) / (1024 * 1024)).toFixed(1);

  const lineCount = universalCode.split('\n').length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 pb-28 overflow-x-hidden box-border">
      
      {/* ─── 1. TOP HEADER & TEMPLATE SELECTOR ─── */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 sm:p-2.5 bg-[#fafafa] hover:bg-neutral-200 border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer shrink-0"
            title="Kembali ke Beranda"
          >
            <ArrowLeft className="w-5 h-5 text-black" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-2xl font-black uppercase tracking-tight text-black flex items-center gap-2 truncate">
                <Clapperboard className="w-5 h-5 sm:w-6 sm:h-6 text-black fill-yellow-400 shrink-0" />
                <span className="truncate">Code to Video Studio</span>
              </h1>
              <span className="px-2 py-0.5 bg-yellow-300 text-black border-2 border-black text-[10px] sm:text-xs font-black shadow-[1.5px_1.5px_0px_#000]">
                DIRECT GPU
              </span>
              <span className="px-2 py-0.5 bg-cyan-300 text-black border-2 border-black text-xs font-black shadow-[1.5px_1.5px_0px_#000] hidden sm:inline-block">
                60 FPS DETERMINISTIC
              </span>
            </div>
            <p className="hidden sm:block text-xs sm:text-sm text-neutral-600 font-semibold mt-0.5">
              Auto-detect semua format kode (HTML/CSS/JS/SVG/GLSL) atau buat video langsung dari Editor Teks.
            </p>
          </div>
        </div>

        {/* Template Selector */}
        <div className="flex items-center gap-2 w-full md:w-72 min-w-0">
          <span className="text-[11px] sm:text-xs font-black uppercase text-neutral-600 whitespace-nowrap shrink-0">
            Template:
          </span>
          <select
            value={selectedTemplateId}
            onChange={(e) => handleSelectTemplate(e.target.value)}
            className="flex-1 min-w-0 w-full bg-white border-2 border-black p-2 font-bold text-xs sm:text-sm shadow-[2px_2px_0px_#000] focus:outline-none focus:ring-2 focus:ring-black cursor-pointer truncate"
          >
            {CODE_TEMPLATES.map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                {tmpl.name} ({tmpl.badge})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── MOBILE SECTION SWITCHER ─── */}
      <div className="grid grid-cols-3 lg:hidden bg-white border-2 border-black shadow-[3px_3px_0px_#000] p-1 gap-1 w-full">
        <button
          onClick={() => setMobileSection('preview')}
          className={`py-2 px-1 text-[11px] font-black uppercase text-center transition-colors truncate ${
            mobileSection === 'preview' ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'
          }`}
        >
          Preview
        </button>
        <button
          onClick={() => setMobileSection('editor')}
          className={`py-2 px-1 text-[11px] font-black uppercase text-center transition-colors truncate ${
            mobileSection === 'editor' ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'
          }`}
        >
          Editor
        </button>
        <button
          onClick={() => setMobileSection('export')}
          className={`py-2 px-1 text-[11px] font-black uppercase text-center transition-colors truncate ${
            mobileSection === 'export' ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'
          }`}
        >
          Render
        </button>
      </div>

      {/* ─── 2. MAIN 2-COLUMN WORKSPACE ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        
        {/* ─── KOLOM KIRI: EDITOR KODE UNIVERSAL & EDITOR TEKS ─── */}
        <div
          className={`min-w-0 w-full lg:col-span-6 bg-white border-2 border-black shadow-[4px_4px_0px_#000] flex flex-col overflow-hidden ${
            mobileSection === 'editor' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Header Editor: Tab Editor Kode | Editor Teks + Pil Auto-Detect Pasif */}
          <div className="p-3 bg-neutral-100 border-b-2 border-black space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="grid grid-cols-2 border-2 border-black bg-white shadow-[2px_2px_0px_#000]">
                <button
                  type="button"
                  onClick={() => {
                    setEditorTab('code');
                    setErrorLog(null);
                    if (liveIframeRef.current) {
                      liveIframeRef.current.srcdoc = compileUniversalCode(universalCode, 'live', {
                        width: virtualDims.width,
                        height: virtualDims.height
                      });
                    }
                    startTimeRef.current = performance.now();
                    setIsPlaying(true);
                  }}
                  className={`px-3 py-1.5 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    editorTab === 'code' ? 'bg-yellow-300 text-black' : 'hover:bg-neutral-100 text-neutral-700'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Editor Kode</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditorTab('text');
                    setErrorLog(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-black border-l-2 border-black flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    editorTab === 'text' ? 'bg-cyan-300 text-black' : 'hover:bg-neutral-100 text-neutral-700'
                  }`}
                >
                  <Type className="w-3.5 h-3.5 shrink-0" />
                  <span>Editor Teks</span>
                </button>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2">
                <span className="px-2 py-1 bg-white border border-black text-[11px] font-bold text-neutral-800 truncate">
                  {editorTab === 'text' ? `Teks: ${compiledPrompt.summary.topicLabel}` : `Auto-Detect: ${detectedLanguage.label}`}
                </span>
                <span className="hidden sm:inline-block text-[10px] bg-neutral-200 border border-black px-1.5 py-0.5 font-mono font-bold shrink-0">
                  Ctrl+Enter: Run
                </span>
              </div>
            </div>
          </div>

          {/* Isi Panel Kiri: Editor Kode Tunggal ATAU Editor Teks Bebas */}
          {editorTab === 'code' ? (
            <div className="relative flex bg-[#121218] text-white font-mono text-xs sm:text-sm h-[320px] sm:h-[440px] lg:h-[480px] overflow-hidden min-w-0">
              <div className="w-8 sm:w-11 bg-[#09090d] text-neutral-500 py-3 select-none text-right pr-2 sm:pr-3 font-mono text-[11px] sm:text-xs border-r border-neutral-800 overflow-hidden leading-relaxed shrink-0">
                {lineNumbers.map((num) => (
                  <div key={num}>{num}</div>
                ))}
              </div>

              <textarea
                ref={textareaRef}
                value={universalCode}
                onChange={(e) => setUniversalCode(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, setUniversalCode, universalCode)}
                spellCheck="false"
                className="flex-1 min-w-0 p-2.5 sm:p-3 bg-transparent text-emerald-400 font-mono text-xs sm:text-sm leading-relaxed resize-none focus:outline-none overflow-x-auto overflow-y-auto whitespace-pre selection:bg-neutral-700 selection:text-white"
                placeholder="// Tempel kode HTML, CSS keyframes, SVG, GLSL Shader, Three.js, atau Pure JS Canvas di sini..."
              />
            </div>
          ) : (
            <div className="p-3.5 sm:p-4 bg-white space-y-3.5 max-h-[540px] overflow-y-auto text-xs">
              {/* Contoh Cepat 1-Klik */}
              <div className="space-y-1.5">
                <span className="font-black uppercase text-[11px] text-neutral-700 block">
                  Contoh Prompt Cepat (1 Klik Langsung Jadi):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PROMPT_SAMPLES.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => {
                        setTextPrompt(sample.prompt);
                        setPromptOptions({ visualStyle: sample.style, mood: sample.mood });
                      }}
                      className="px-2.5 py-1.5 bg-neutral-100 hover:bg-yellow-300 text-black border border-black font-bold text-[11px] transition-colors cursor-pointer"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Area Ketik Bebas */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-black uppercase text-[11px] text-neutral-800">
                    Tulis Ide Video / Teks Bebas Anda
                  </label>
                  <span className="text-[10px] font-mono text-neutral-500">
                    {textPrompt.trim().length} karakter
                  </span>
                </div>
                <textarea
                  value={textPrompt}
                  onChange={(e) => setTextPrompt(e.target.value)}
                  placeholder={'Ceritakan video yang ingin dibuat...\nContoh: "Iklan promo minuman matcha susu by Kedai Kuro, segar pakai susu oat premium, diskon Rp 15.000 dari Rp 24.000, gratis ongkir area Jakarta, order via GoFood."'}
                  className="w-full min-h-[210px] sm:min-h-[245px] p-3 bg-neutral-50 border-2 border-black font-semibold text-xs sm:text-sm leading-relaxed resize-y focus:bg-white focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              {/* Ringkasan Entitas Terdeteksi */}
              <div className="p-2.5 bg-cyan-50 border-2 border-black flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="px-2 py-0.5 bg-black text-white font-black uppercase">
                  {compiledPrompt.summary.topicLabel}
                </span>
                <span className="px-2 py-0.5 bg-white border border-black font-bold">
                  Brand: {compiledPrompt.summary.brand}
                </span>
                <span className="px-2 py-0.5 bg-white border border-black font-bold">
                  Mood: {compiledPrompt.summary.colorName}
                </span>
                {compiledPrompt.summary.hasPromoPrice && (
                  <span className="px-2 py-0.5 bg-yellow-300 border border-black font-black">
                    Harga Promo Terdeteksi
                  </span>
                )}
              </div>

              {/* 2 Baris Opsi Kompak: Gaya Visual & Mood Warna */}
              <div className="space-y-2 pt-1 border-t border-neutral-200">
                <div className="space-y-1">
                  <label className="font-black uppercase text-[11px] text-neutral-700 block">Gaya Visual</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {PROMPT_VISUAL_STYLES.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setPromptOptions((prev) => ({ ...prev, visualStyle: st.id }))}
                        className={`px-2 py-1.5 border-2 border-black text-left transition-all cursor-pointer ${
                          promptOptions.visualStyle === st.id
                            ? 'bg-yellow-300 text-black shadow-[2px_2px_0px_#000]'
                            : 'bg-white hover:bg-neutral-100 text-neutral-800'
                        }`}
                        title={st.desc}
                      >
                        <div className="font-black text-[11px] truncate">{st.name}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-black uppercase text-[11px] text-neutral-700 flex items-center gap-1">
                    <Palette className="w-3.5 h-3.5" />
                    Mood Warna
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PROMPT_COLOR_MOODS.map((mood) => (
                      <button
                        key={mood.id}
                        type="button"
                        onClick={() => setPromptOptions((prev) => ({ ...prev, mood: mood.id }))}
                        className={`px-2.5 py-1.5 border-2 border-black text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${
                          promptOptions.mood === mood.id
                            ? 'bg-black text-white shadow-[1.5px_1.5px_0px_#000]'
                            : 'bg-white hover:bg-neutral-100 text-black'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-black inline-block shrink-0"
                          style={{ background: mood.dot }}
                        />
                        <span>{mood.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tombol Aksi Prompt Compiler */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleGeneratePromptAnimation}
                  className="py-2.5 px-3 bg-cyan-300 hover:bg-cyan-200 text-black border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs flex items-center justify-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
                >
                  <Wand2 className="w-4 h-4" />
                  Generate Animasi
                </button>
                <button
                  type="button"
                  onClick={handleOpenTextInCodeEditor}
                  className="py-2.5 px-3 bg-neutral-900 hover:bg-neutral-800 text-white border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs flex items-center justify-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
                >
                  <Code2 className="w-4 h-4 text-cyan-300" />
                  Buka di Editor Kode
                </button>
              </div>
            </div>
          )}

          {/* Error Console */}
          {errorLog && (
            <div className="p-3 bg-red-100 border-t-2 border-black text-red-900 font-mono text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 break-words">
                <span className="font-bold">Error Console:</span> {errorLog}
              </div>
            </div>
          )}

          {/* Action Bar di Bawah Editor (Mobile-Safe 2-col Grid & Desktop Flex) */}
          <div className="p-3 bg-neutral-100 border-t-2 border-black grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-between gap-2">
            <button
              onClick={handleApplyCode}
              className="col-span-2 sm:col-span-1 px-4 py-2 bg-green-400 hover:bg-green-300 text-black border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs flex items-center justify-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer min-h-[42px]"
              title="Terapkan Kode ke Pratinjau (Ctrl+Enter)"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>Jalankan / Update</span>
            </button>

            <button
              onClick={handleResetCode}
              className={`px-3 py-2 border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-bold text-xs flex items-center justify-center gap-1 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer min-h-[42px] ${
                confirmReset ? 'bg-red-500 text-white animate-pulse' : 'bg-white hover:bg-neutral-200 text-black'
              }`}
              title="Kembalikan ke Bawaan"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{confirmReset ? 'Yakin Reset?' : 'Reset'}</span>
            </button>

            <button
              onClick={handleCopyCode}
              className="px-3 py-2 bg-white hover:bg-neutral-200 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-bold text-xs flex items-center justify-center gap-1 min-h-[42px] cursor-pointer"
              title="Salin Kode"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-700" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Tersalin' : 'Salin'}</span>
            </button>

            <button
              onClick={handleExportCodeFile}
              className="px-3 py-2 bg-white hover:bg-neutral-200 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-bold text-xs flex items-center justify-center gap-1 min-h-[42px] cursor-pointer"
              title="Unduh Berkas Kode"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 bg-white hover:bg-neutral-200 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] font-bold text-xs flex items-center justify-center gap-1 min-h-[42px] cursor-pointer"
              title="Unggah Berkas Kode atau Cadangan Proyek (.kurovid.json)"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Impor</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm,.js,.jsx,.txt,.css,.svg,.glsl,.frag,.json,.kurovid.json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>
        </div>

        {/* ─── KOLOM KANAN: PREVIEW & PENGATURAN STUDIO ─── */}
        <div
          className={`min-w-0 w-full lg:col-span-6 space-y-4 ${
            mobileSection === 'preview' ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Quick Preset Action Bar */}
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-black uppercase text-neutral-600 flex items-center gap-1.5 shrink-0">
              <SlidersHorizontal className="w-4 h-4 text-black" />
              Preset Komposisi:
            </span>
            <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto">
              <button
                onClick={() => handleQuickPreset('clean-full')}
                className="px-2 py-1.5 bg-yellow-300 hover:bg-yellow-400 border border-black font-black text-[11px] shadow-[1.5px_1.5px_0px_#000] cursor-pointer text-center truncate"
                title="100% Layar Penuh Tanpa Efek Tambahan"
              >
                Fullscreen
              </button>
              <button
                onClick={() => handleQuickPreset('cinematic-full')}
                className="px-2 py-1.5 bg-cyan-300 hover:bg-cyan-400 border border-black font-black text-[11px] shadow-[1.5px_1.5px_0px_#000] cursor-pointer text-center truncate"
                title="Layar Penuh + Partikel + Vignette Sinematik"
              >
                Sinematik
              </button>
              <button
                onClick={() => handleQuickPreset('studio-3d')}
                className="px-2 py-1.5 bg-pink-300 hover:bg-pink-400 border border-black font-black text-[11px] shadow-[1.5px_1.5px_0px_#000] cursor-pointer text-center truncate"
                title="Bingkai TV 3D + Orbit + Awan"
              >
                3D TV
              </button>
            </div>
          </div>

          {/* Viewport Box (Canvas Output & Scaled Virtual HD Live Stage) */}
          <div
            ref={viewportRef}
            className="bg-black border-2 border-black shadow-[4px_4px_0px_#000] p-2 relative flex flex-col items-center justify-center overflow-hidden min-w-0"
          >
            <div
              ref={stageOuterRef}
              className="w-full relative flex items-center justify-center bg-neutral-950 overflow-hidden"
              style={{
                aspectRatio: exportAspect.replace(':', '/'),
                maxHeight: isFullscreen ? 'calc(100vh - 80px)' : '440px',
                minHeight: '210px'
              }}
            >
              {/* Mode Layar Penuh: Panggung Virtual HD Tersekalakan (Tajam & Anti-Terpotong di HP) */}
              {!settings.stage3d ? (
                <div
                  style={{
                    width: `${Math.max(1, Math.round(virtualDims.width * stageScale))}px`,
                    height: `${Math.max(1, Math.round(virtualDims.height * stageScale))}px`,
                    position: 'relative',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}
                >
                  <div
                    style={{
                      width: `${virtualDims.width}px`,
                      height: `${virtualDims.height}px`,
                      transform: `scale(${stageScale})`,
                      transformOrigin: 'top left',
                      position: 'relative'
                    }}
                  >
                    <iframe
                      ref={liveIframeRef}
                      sandbox="allow-scripts allow-same-origin"
                      className="border-0"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 1,
                        pointerEvents: isRendering || bundleExportState.active ? 'none' : 'auto'
                      }}
                      title="Live Animation Stage"
                    />
                    <canvas
                      ref={overlayCanvasRef}
                      width={virtualDims.width}
                      height={virtualDims.height}
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      style={{ zIndex: 2 }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <iframe
                    ref={liveIframeRef}
                    sandbox="allow-scripts allow-same-origin"
                    className="border-0"
                    style={{
                      position: 'fixed',
                      left: 0,
                      top: 0,
                      width: `${virtualDims.width}px`,
                      height: `${virtualDims.height}px`,
                      opacity: 0.001,
                      pointerEvents: 'none',
                      zIndex: -10
                    }}
                    title="Live Animation Stage"
                  />
                  <canvas
                    ref={canvasRef}
                    className="w-full h-full object-contain rounded-sm relative"
                    style={{ zIndex: 1 }}
                  />
                </>
              )}

              {!isPlaying && (
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/80 text-yellow-300 border border-yellow-400 font-mono text-[10px] font-bold z-10">
                  PAUSED
                </div>
              )}
              {(isRendering || bundleExportState.active) && (
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white font-mono text-[10px] font-black animate-pulse z-10">
                  REC ●
                </div>
              )}
            </div>

            {/* Viewport Controls Bar */}
            <div className="w-full bg-neutral-900/90 text-white p-2 mt-2 flex items-center justify-between gap-2 border border-neutral-700 text-xs">
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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
                <span className="font-mono text-[11px] text-neutral-400 pl-0.5">
                  FPS: <span className="text-green-400 font-bold">{fpsDisplay}</span>
                </span>
              </div>

              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] sm:text-[11px] font-mono px-2 py-0.5 bg-neutral-800 border border-neutral-700 text-yellow-300 truncate">
                  {exportAspect} &bull; {virtualDims.width}&times;{virtualDims.height} &bull; {settings.stage3d ? '3D TV' : 'HD STAGE'}
                </span>
                <button
                  onClick={handleToggleFullscreen}
                  className="p-1.5 bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-600 cursor-pointer shrink-0"
                  title="Layar Penuh"
                >
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* 3 Tab Pengaturan Visual */}
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-4">
            
            {/* Header Tab (Grid 3 Kolom Anti-Terpotong Mobile) */}
            <div className="grid grid-cols-3 border-b-2 border-black mb-4 gap-1 sm:gap-2 pb-1">
              <button
                onClick={() => setActiveTab('camera')}
                className={`px-1.5 sm:px-3 py-2 text-[11px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 border-t-2 border-l-2 border-r-2 border-black -mb-[2px] cursor-pointer truncate ${
                  activeTab === 'camera' ? 'bg-yellow-300 text-black' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Tv className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">3D TV</span>
              </button>

              <button
                onClick={() => setActiveTab('fx')}
                className={`px-1.5 sm:px-3 py-2 text-[11px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 border-t-2 border-l-2 border-r-2 border-black -mb-[2px] cursor-pointer truncate ${
                  activeTab === 'fx' ? 'bg-cyan-300 text-black' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Awan &amp; Efek</span>
              </button>

              <button
                onClick={() => setActiveTab('hud')}
                className={`px-1.5 sm:px-3 py-2 text-[11px] sm:text-xs font-black uppercase flex items-center justify-center gap-1 border-t-2 border-l-2 border-r-2 border-black -mb-[2px] cursor-pointer truncate ${
                  activeTab === 'hud' ? 'bg-pink-300 text-black' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Type className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Teks HUD</span>
              </button>
            </div>

            {/* TAB 1: PANGGUNG & KAMERA 3D */}
            {activeTab === 'camera' && (
              <div className="space-y-4 text-xs">
                
                {/* Sakelar Toggle: Bingkai TV / Panggung 3D */}
                <div className="p-3 bg-neutral-50 border-2 border-black flex items-center justify-between">
                  <div>
                    <span className="font-black text-black block text-sm">
                      Aktifkan Bingkai TV / Panggung 3D
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      {settings.stage3d
                        ? 'Animasi dimuat ke dalam bingkai TV 3D mengambang dengan latar.'
                        : 'OFF: Animasi tampil 100% Layar Penuh (Direct GPU Full-Bleed, 0px margin, tanpa TV).'}
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
                      Mode Full Layar Direct GPU Aktif: Animasi memenuhi 100% kanvas dengan akselerasi penuh.
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
                        onChange={(e) => {
                          const spd = Number(e.target.value);
                          setSettings((s) => ({ ...s, motionSpeed: spd }));
                          try {
                            liveIframeRef.current?.contentWindow?.postMessage({
                              type: 'ctv-live-speed',
                              speedMultiplier: spd
                            }, '*');
                          } catch {}
                        }}
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
                          onChange={(e) => {
                            const spd = Number(e.target.value);
                            setSettings((s) => ({ ...s, motionSpeed: spd }));
                            try {
                              liveIframeRef.current?.contentWindow?.postMessage({
                                type: 'ctv-live-speed',
                                speedMultiplier: spd
                              }, '*');
                            } catch {}
                          }}
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
        className={`min-w-0 w-full bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-4 sm:p-6 space-y-5 ${
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
              Render video bebas patah-patah dengan WebCodecs MP4/WebM multi-browser dan Virtual Clock Frame Stepping.
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
            Otomatis unduh berkas video setelah proses render selesai
          </label>
        </div>

        {/* Tombol Mulai Render */}
        {!isRendering && !bundleExportState.active && !renderResult && (
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

        {/* Status Proses Paket ZIP CapCut / FCPXML */}
        {bundleExportState.active && (
          <div className="p-4 bg-cyan-50 border-2 border-black space-y-2.5">
            <div className="flex items-center justify-between gap-2 font-black text-xs text-black">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-cyan-600 animate-ping inline-block" />
                {bundleExportState.label}
              </span>
              <span className="font-mono">{bundleExportState.percent}%</span>
            </div>
            <div className="w-full h-5 bg-white border-2 border-black relative overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-150"
                style={{ width: `${bundleExportState.percent}%` }}
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleCancelRender}
                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs uppercase cursor-pointer"
              >
                Batalkan Paket
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
              <div className="flex items-center gap-2 font-mono font-bold text-xs flex-wrap">
                <span className="px-2 py-0.5 bg-white border border-black">
                  {renderResult.width} &times; {renderResult.height}
                </span>
                <span className="px-2 py-0.5 bg-white border border-black">
                  {renderResult.sizeMB} MB
                </span>
                <span className="px-2 py-0.5 bg-yellow-300 border border-black">
                  {renderResult.format.toUpperCase()}
                </span>
                <span className="px-2 py-0.5 bg-emerald-200 border border-black text-emerald-950 font-bold">
                  {renderResult.engineName}
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

        {/* EKSPOR KE APLIKASI EDITOR (BISA DIEDIT LAGI) */}
        <div className="pt-4 border-t-2 border-black space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <h4 className="font-black text-xs sm:text-sm uppercase text-black flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              Ekspor ke Aplikasi Editor (Bisa Diedit Lagi)
            </h4>
            <span className="text-[11px] font-semibold text-neutral-600">
              Pisahkan layer video, teks PNG transparan, subtitle SRT &amp; timeline XML/Draft
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            <button
              type="button"
              onClick={handleExportAlightMotion}
              disabled={isRendering || bundleExportState.active}
              className="p-3 bg-yellow-200 hover:bg-yellow-300 disabled:opacity-50 text-black border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all text-left cursor-pointer flex flex-col justify-between gap-1.5"
            >
              <div className="font-black flex items-center gap-1.5">
                <FileCode2 className="w-4 h-4 shrink-0" />
                <span>Alight Motion (.xml)</span>
              </div>
              <span className="text-[11px] font-semibold text-neutral-800 leading-snug">
                Layer teks &amp; shape terpisah dengan keyframe posisi/skala siap impor XML.
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportCapCutBundle}
              disabled={isRendering || bundleExportState.active}
              className="p-3 bg-cyan-200 hover:bg-cyan-300 disabled:opacity-50 text-black border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all text-left cursor-pointer flex flex-col justify-between gap-1.5"
            >
              <div className="font-black flex items-center gap-1.5">
                <FolderArchive className="w-4 h-4 shrink-0" />
                <span>CapCut Editable Bundle (.zip)</span>
              </div>
              <span className="text-[11px] font-semibold text-neutral-800 leading-snug">
                Video final, video latar polos tanpa teks, PNG transparan, .SRT &amp; Draft Desktop.
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportFcpxmlBundle}
              disabled={isRendering || bundleExportState.active}
              className="p-3 bg-pink-200 hover:bg-pink-300 disabled:opacity-50 text-black border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all text-left cursor-pointer flex flex-col justify-between gap-1.5"
            >
              <div className="font-black flex items-center gap-1.5">
                <Film className="w-4 h-4 shrink-0" />
                <span>FCPXML v1.9 Bundle (.zip)</span>
              </div>
              <span className="text-[11px] font-semibold text-neutral-800 leading-snug">
                Timeline multi-track untuk Final Cut Pro, DaVinci Resolve &amp; Premiere.
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportProjectJson}
              disabled={isRendering || bundleExportState.active}
              className="p-3 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-50 text-black border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all text-left cursor-pointer flex flex-col justify-between gap-1.5"
            >
              <div className="font-black flex items-center gap-1.5">
                <Save className="w-4 h-4 shrink-0" />
                <span>Backup Studio (.kurovid.json)</span>
              </div>
              <span className="text-[11px] font-semibold text-neutral-800 leading-snug">
                Simpan seluruh prompt, kode, &amp; setelan studio untuk dimuat kembali via Impor.
              </span>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
