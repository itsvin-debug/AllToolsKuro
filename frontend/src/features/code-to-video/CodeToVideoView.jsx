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
  Type,
  AlertCircle,
  Clapperboard,
  Film,
  Video,
  Maximize2,
  Minimize2,
  CheckCircle2,
  SlidersHorizontal,
  Wand2,
  Layers,
  FolderArchive,
  FileCode2,
  Save,
  Info,
  Clock
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
  BITRATE_PRESETS,
  DEFAULT_STUDIO_SETTINGS,
  STUDIO_FONT_PRESETS,
  buildCssFilterString,
  computeMotionAndFrameRect
} from './codeToVideoEngine';
import {
  QUICK_PROMPT_SAMPLES,
  compileTextPromptToSceneGraph
} from './textPromptCompiler';
import {
  exportAlightMotionXML,
  exportCapCutBundleZip,
  exportFcpxmlBundleZip,
  exportKuroStudioProjectJson,
  parseKuroStudioProjectJson
} from './projectExporter';
import StudioCustomPanel from './StudioCustomPanel';
import PreviewControlBar from './PreviewControlBar';
import { downloadBlob, downloadText, downloadFromUrl } from '../../shared/utils/fileDownload';
import { copyTextToClipboard } from '../../shared/utils/clipboard';

function formatSecondsToMmSs(sec = 0) {
  const safe = Math.max(0, Math.round(Number(sec) || 0));
  const m = String(Math.floor(safe / 60)).padStart(2, '0');
  const s = String(safe % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function CodeToVideoView({ onBack, onShowToast, lang = 'id' }) {
  // --- TEMPLATE, TAB EDITOR UNIVERSAL & EDITOR TEKS ---
  const [selectedTemplateId, setSelectedTemplateId] = useState('promo-ad');
  const [editorTab, setEditorTab] = useState('code'); // 'code' | 'text'
  const [showStudioInfo, setShowStudioInfo] = useState(true);

  const [universalCode, setUniversalCode] = useState(() => {
    return (
      localStorage.getItem('kuro_c2v_universal_code') ||
      localStorage.getItem('kuro_c2v_code_all') ||
      buildCompositeHtml(CODE_TEMPLATES[0].html, CODE_TEMPLATES[0].css, CODE_TEMPLATES[0].js)
    );
  });

  const [textPrompt, setTextPrompt] = useState(() => {
    return localStorage.getItem('kuro_c2v_text_prompt') || QUICK_PROMPT_SAMPLES[0].prompt;
  });

  // Satukan seluruh pengaturan desain, efek, HUD, dan kamera dalam 1 objek persisten
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('kuro_c2v_studio_settings');
      if (saved) {
        const parsed = { ...DEFAULT_STUDIO_SETTINGS, ...JSON.parse(saved) };
        if (parsed.pureBypassMode) {
          parsed.stage3d = false;
          if (parsed.frameStyle === '3d-tv') parsed.frameStyle = 'full';
          if (parsed.cameraMotion === 'auto-orbit') parsed.cameraMotion = 'static';
          parsed.autoOrbit = false;
        }
        return parsed;
      }
    } catch {}
    return { ...DEFAULT_STUDIO_SETTINGS };
  });

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    try {
      localStorage.setItem('kuro_c2v_studio_settings', JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [errorLog, setErrorLog] = useState(null);
  const [live3dWarning, setLive3dWarning] = useState(false);

  const [mobileSection, setMobileSection] = useState('preview'); // 'preview' | 'editor' | 'export'
  const [isDesktopViewport, setIsDesktopViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const isPreviewVisible = isDesktopViewport || mobileSection === 'preview';
  const is3dMode = !settings.pureBypassMode && (settings.frameStyle === '3d-tv' || Boolean(settings.stage3d));

  useEffect(() => {
    const onResizeVp = () => {
      setIsDesktopViewport(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', onResizeVp);
    return () => window.removeEventListener('resize', onResizeVp);
  }, []);

  // --- VIEWPORT & PREVIEW STATE ---
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [fpsDisplay, setFpsDisplay] = useState(60);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isPlayingRef = useRef(true);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // --- EKSPOR VIDEO SETTINGS (DURASI HINGGA 300 DETIK / 5 MENIT) ---
  const [exportRes, setExportRes] = useState('1080p');
  const [exportAspect, setExportAspect] = useState('16:9');
  const [exportFps, setExportFps] = useState(60);
  const [exportDuration, setExportDuration] = useState(12);
  const [exportBitrate, setExportBitrate] = useState('high');
  const [autoDownload, setAutoDownload] = useState(true);

  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState({
    frame: 0,
    totalFrames: 0,
    percent: 0,
    timeRemainingSec: 0,
    currentVideoTimeSec: 0,
    totalVideoDurationSec: 12
  });
  const [renderResult, setRenderResult] = useState(null);
  const [bundleExportState, setBundleExportState] = useState({
    active: false,
    label: '',
    percent: 0
  });

  // Dimensi virtual HD tetap & faktor skala CSS agar Live Preview selalu tajam di HP & desktop
  const virtualDims = useMemo(() => getVirtualStageSize(exportAspect), [exportAspect]);
  const [stageScale, setStageScale] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth > 32) {
      const boxW = window.innerWidth < 1024 ? Math.max(260, window.innerWidth - 36) : Math.min(580, window.innerWidth * 0.45);
      return Math.max(0.22, Number((boxW / 1280).toFixed(4)));
    }
    return 0.28;
  });
  const [iframeRunKey, setIframeRunKey] = useState(1);

  // Kompilasi SceneGraph & HTML animasi multi-adegan dari prompt Editor Teks
  const compiledPrompt = useMemo(() => {
    const dur = Math.max(3, Math.min(Number(exportDuration) || 12, 300));
    return compileTextPromptToSceneGraph(textPrompt, settings, dur);
  }, [textPrompt, settings, exportDuration]);

  const effectiveExportDuration = useMemo(() => {
    if (editorTab === 'text' && settings.autoDuration) {
      return Math.max(3, Math.min(300, compiledPrompt.summary.recommendedDuration || 12));
    }
    return Math.max(3, Math.min(300, Number(exportDuration) || 12));
  }, [editorTab, settings.autoDuration, compiledPrompt.summary.recommendedDuration, exportDuration]);

  const effectiveDurationRef = useRef(effectiveExportDuration);
  useEffect(() => {
    effectiveDurationRef.current = effectiveExportDuration;
  }, [effectiveExportDuration]);

  const [compiledLiveHtml, setCompiledLiveHtml] = useState(() => {
    const initDims = getVirtualStageSize('16:9');
    return compileUniversalCode(universalCode, 'live', {
      width: initDims.width,
      height: initDims.height,
      fontCss: settings?.pureBypassMode ? '' : (STUDIO_FONT_PRESETS[settings?.fontFamily] || ''),
      studioSettings: settings,
      duration: 12
    });
  });

  // --- REFS ---
  const liveIframeRef = useRef(null);
  const stageContentWrapRef = useRef(null);
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
  const liveCaptureInFlightRef = useRef(false);
  const liveCaptureSentAtRef = useRef(0);
  const live3dWaitSinceRef = useRef(0);
  const live3dWarnedRef = useRef(false);
  const prevPreviewVisibleRef = useRef(isPreviewVisible);
  const currentTimeSecRef = useRef(0);
  const isScrubbingRef = useRef(false);
  const lastIframeTimeReportAtRef = useRef(0);
  const lastUiTimeSyncAtRef = useRef(0);
  const lastUiFpsSyncAtRef = useRef(0);
  const prevDurationRef = useRef(12);

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

  const getActiveSourceCode = useCallback(() => {
    if (editorTab === 'text') {
      return compiledPrompt.generatedHtmlCode;
    }
    return universalCode;
  }, [editorTab, compiledPrompt.generatedHtmlCode, universalCode]);

  const getActiveFontCss = useCallback((cfg = settingsRef.current) => {
    if (cfg?.pureBypassMode) return '';
    return STUDIO_FONT_PRESETS[cfg?.fontFamily] || '';
  }, []);

  const syncIframeViewport = useCallback((dims = virtualDims) => {
    try {
      const win = liveIframeRef.current?.contentWindow;
      if (win) {
        win.postMessage({ type: 'ctv-force-resize', width: dims.width, height: dims.height }, '*');
      }
    } catch {}
  }, [virtualDims]);

  const triggerLiveRun = useCallback((sourceCode, {
    aspect = exportAspect,
    cfg = settingsRef.current,
    dur = effectiveDurationRef.current,
    switchMobilePreview = false
  } = {}) => {
    const dims = getVirtualStageSize(aspect);
    const compiled = compileUniversalCode(sourceCode, 'live', {
      width: dims.width,
      height: dims.height,
      fontCss: getActiveFontCss(cfg),
      studioSettings: cfg,
      duration: dur
    });
    setErrorLog(null);
    liveCaptureInFlightRef.current = false;
    lastIframeTimeReportAtRef.current = 0;
    currentTimeSecRef.current = 0;
    setCurrentTimeSec(0);
    setCompiledLiveHtml(compiled);
    setIframeRunKey((k) => k + 1);
    startTimeRef.current = performance.now();
    setIsPlaying(true);

    if (switchMobilePreview && typeof window !== 'undefined' && window.innerWidth < 1024) {
      setMobileSection('preview');
      requestAnimationFrame(() => {
        syncIframeViewport(dims);
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event('resize'));
          syncIframeViewport(dims);
          viewportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
    }
  }, [exportAspect, getActiveFontCss, syncIframeViewport]);

  // ResizeObserver + fallback > 0 agar transform: scale(...) tidak pernah 0 atau NaN di mobile
  useEffect(() => {
    const outerEl = stageOuterRef.current;
    if (!outerEl) return undefined;

    const recalcScale = () => {
      const rect = outerEl.getBoundingClientRect();
      if (rect.width > 16 && rect.height > 16) {
        const nextScale = Math.min(rect.width / virtualDims.width, rect.height / virtualDims.height);
        setStageScale(Number.isFinite(nextScale) && nextScale > 0 ? Math.max(0.2, Number(nextScale.toFixed(4))) : 0.28);
      } else {
        const fallbackW = typeof window !== 'undefined' && window.innerWidth > 32
          ? Math.min(Math.max(window.innerWidth - 32, 260), 640)
          : 360;
        const fallbackH = fallbackW * (virtualDims.height / Math.max(1, virtualDims.width));
        const nextScale = Math.min(fallbackW / virtualDims.width, fallbackH / virtualDims.height);
        setStageScale(Number.isFinite(nextScale) && nextScale > 0 ? Math.max(0.2, Number(nextScale.toFixed(4))) : 0.28);
      }
      syncIframeViewport(virtualDims);
    };

    recalcScale();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(recalcScale);
    });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recalcScale) : null;
    if (ro) ro.observe(outerEl);
    window.addEventListener('resize', recalcScale);

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', recalcScale);
    };
  }, [virtualDims, mobileSection, isFullscreen, iframeRunKey, isPreviewVisible, syncIframeViewport]);

  // Pastikan Live Iframe mobile dimuat ulang dengan dimensi nyata saat tab Preview baru terlihat
  useEffect(() => {
    const wasVisible = prevPreviewVisibleRef.current;
    prevPreviewVisibleRef.current = isPreviewVisible;
    if (!wasVisible && isPreviewVisible && !isDesktopViewport) {
      const raf = requestAnimationFrame(() => {
        setIframeRunKey((k) => k + 1);
        syncIframeViewport(virtualDims);
      });
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
  }, [isPreviewVisible, isDesktopViewport, syncIframeViewport, virtualDims]);

  // Kaitkan ulang canvas 3D TV ke compositor setiap kali node canvas 3D ter-mount
  useEffect(() => {
    if (!compositorRef.current) return;
    if (is3dMode && canvasRef.current) {
      compositorRef.current.attachPreviewCanvas(canvasRef.current);
      compositorRef.current.resetFrameTracking();
      liveCaptureInFlightRef.current = false;
      liveCaptureSentAtRef.current = 0;
      live3dWaitSinceRef.current = performance.now();
      live3dWarnedRef.current = false;
      setLive3dWarning(false);
    } else if (!is3dMode) {
      live3dWaitSinceRef.current = 0;
      live3dWarnedRef.current = false;
      setLive3dWarning(false);
    }
  }, [is3dMode, virtualDims.width, virtualDims.height, isPreviewVisible]);

  // Teruskan perubahan durasi ke Live Iframe tanpa reload
  useEffect(() => {
    if (prevDurationRef.current === effectiveExportDuration) return;
    prevDurationRef.current = effectiveExportDuration;
    try {
      liveIframeRef.current?.contentWindow?.postMessage({
        type: 'ctv-set-duration',
        durationSec: effectiveExportDuration
      }, '*');
    } catch {}
  }, [effectiveExportDuration]);

  // Helper tunggal untuk merender frame overlay 2D / panggung 3D pada detik tertentu
  const renderOverlaysAtTime = useCallback((loopT, curSettings = settingsRef.current) => {
    if (!compositorRef.current) return;
    const isBypass = Boolean(curSettings.pureBypassMode);
    const is3d = !isBypass && (curSettings.frameStyle === '3d-tv' || Boolean(curSettings.stage3d));
    const totalDur = effectiveDurationRef.current;
    const frameSettings = { ...curSettings, totalDuration: totalDur };

    if (!is3d) {
      const wrapEl = stageContentWrapRef.current;
      const iframeEl = liveIframeRef.current;
      const motion = computeMotionAndFrameRect(
        compositorRef.current.width,
        compositorRef.current.height,
        loopT,
        totalDur,
        frameSettings
      );
      if (wrapEl) {
        wrapEl.style.left = `${motion.rect.x}px`;
        wrapEl.style.top = `${motion.rect.y}px`;
        wrapEl.style.width = `${motion.rect.w}px`;
        wrapEl.style.height = `${motion.rect.h}px`;
        wrapEl.style.borderRadius = `${motion.rect.radius}px`;
        wrapEl.style.clipPath = motion.wipeProgress < 1
          ? `inset(0 ${Math.round((1 - motion.wipeProgress) * 100)}% 0 0)`
          : 'none';
      }
      if (iframeEl) {
        iframeEl.style.filter = isBypass ? 'none' : buildCssFilterString(curSettings);
        iframeEl.style.opacity = String(isBypass ? 1 : motion.alpha);
        iframeEl.style.transform = isBypass
          ? 'none'
          : `translate(${motion.tx.toFixed(1)}px, ${motion.ty.toFixed(1)}px) scale(${motion.scale.toFixed(4)})`;
      }
      if (overlayCanvasRef.current) {
        const oCanvas = overlayCanvasRef.current;
        const oCtx = oCanvas.getContext('2d');
        compositorRef.current.renderOverlayOnly(oCtx, oCanvas.width, oCanvas.height, loopT, frameSettings);
      }
    } else {
      const nowWall = Date.now();
      if (liveCaptureInFlightRef.current && nowWall - liveCaptureSentAtRef.current > 600) {
        liveCaptureInFlightRef.current = false;
      }
      if (!liveCaptureInFlightRef.current && liveIframeRef.current?.contentWindow) {
        liveCaptureInFlightRef.current = true;
        liveCaptureSentAtRef.current = nowWall;
        liveIframeRef.current.contentWindow.postMessage({
          type: 'ctv-live-capture',
          width: compositorRef.current.width,
          height: compositorRef.current.height
        }, '*');
      }

      if (
        !compositorRef.current.hasReceivedFrame &&
        live3dWaitSinceRef.current > 0 &&
        performance.now() - live3dWaitSinceRef.current > 600 &&
        !live3dWarnedRef.current
      ) {
        live3dWarnedRef.current = true;
        setLive3dWarning(true);
      }

      compositorRef.current.renderFrame(loopT, frameSettings);
    }
  }, []);

  // Inisialisasi Engine Compositor & Loop Direct GPU
  useEffect(() => {
    const initialDims = getVirtualStageSize(exportAspect);
    const comp = new CodeToVideoCompositor(canvasRef.current, initialDims.width, initialDims.height);
    compositorRef.current = comp;

    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = initialDims.width;
      overlayCanvasRef.current.height = initialDims.height;
    }

    startTimeRef.current = performance.now();

    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    // Loop animasi live preview Direct GPU dengan sinkronisasi WYSIWYG 100%
    const loop = (now) => {
      if (isPlayingRef.current && compositorRef.current) {
        const curSettings = settingsRef.current;
        const isBypass = Boolean(curSettings.pureBypassMode);
        const spd = isBypass ? 1.0 : (curSettings.motionSpeed || 1.0);
        const totalDur = effectiveDurationRef.current;

        let loopT = currentTimeSecRef.current;
        const iframeReportFresh = Date.now() - lastIframeTimeReportAtRef.current < 180;
        if (!iframeReportFresh && !isScrubbingRef.current) {
          const elapsedRaw = ((now - startTimeRef.current) / 1000) * spd;
          loopT = totalDur > 0 ? (Math.max(0, elapsedRaw) % totalDur) : Math.max(0, elapsedRaw);
          currentTimeSecRef.current = loopT;
        }

        if (!isScrubbingRef.current && now - lastUiTimeSyncAtRef.current >= 60) {
          lastUiTimeSyncAtRef.current = now;
          setCurrentTimeSec(loopT);
        }

        renderOverlaysAtTime(loopT, curSettings);

        frameCount++;
        if (now - lastFpsUpdate >= 500) {
          if (Date.now() - lastIframeTimeReportAtRef.current >= 600) {
            setFpsDisplay(Math.round((frameCount * 1000) / Math.max(1, now - lastFpsUpdate)));
          }
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
  }, [renderOverlaysAtTime]);

  // Sinkronisasi state fullscreen (Esc & Space shortcut saat tidak mengetik di form)
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    const onGlobalKeyDown = (e) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const isEditingInput = tag === 'textarea' || tag === 'input' || tag === 'select' || document.activeElement?.isContentEditable;
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      } else if (e.code === 'Space' && !isEditingInput && isPreviewVisible) {
        e.preventDefault();
        setIsPlaying((prev) => {
          const next = !prev;
          const spd = settingsRef.current?.pureBypassMode ? 1.0 : (Number(settingsRef.current?.motionSpeed) || 1.0);
          if (next) {
            startTimeRef.current = performance.now() - (currentTimeSecRef.current * 1000) / Math.max(0.1, spd);
          }
          try {
            liveIframeRef.current?.contentWindow?.postMessage({
              type: next ? 'ctv-live-resume' : 'ctv-live-pause'
            }, '*');
          } catch {}
          return next;
        });
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('keydown', onGlobalKeyDown);
    };
  }, [isFullscreen, isPreviewVisible]);

  // Tangkap error runtime, pelaporan waktu FPS, & bitmap frame live preview dari iframe sandbox
  useEffect(() => {
    const handleMsg = (e) => {
      if (e.data?.type === 'ctv-error') {
        setErrorLog(e.data.error);
      } else if (e.data?.type === 'ctv-time') {
        const nowWall = Date.now();
        lastIframeTimeReportAtRef.current = nowWall;
        if (!isScrubbingRef.current) {
          const maxDur = effectiveDurationRef.current;
          const nextSec = Math.max(0, Math.min(maxDur, (Number(e.data.timeMs) || 0) / 1000));
          currentTimeSecRef.current = nextSec;
          const spd = settingsRef.current?.pureBypassMode ? 1.0 : (Number(settingsRef.current?.motionSpeed) || 1.0);
          startTimeRef.current = performance.now() - (nextSec * 1000) / Math.max(0.1, spd);
          if (nowWall - lastUiTimeSyncAtRef.current >= 60) {
            lastUiTimeSyncAtRef.current = nowWall;
            setCurrentTimeSec(nextSec);
          }
        }
        if (Number.isFinite(e.data.fps) && e.data.fps > 0 && nowWall - lastUiFpsSyncAtRef.current >= 500) {
          lastUiFpsSyncAtRef.current = nowWall;
          setFpsDisplay(Math.round(e.data.fps));
        }
      } else if (e.data?.type === 'ctv-live-frame') {
      } else if (e.data?.type === 'ctv-live-frame') {
        liveCaptureInFlightRef.current = false;
        if (compositorRef.current) {
          if (e.data.bitmap) {
            compositorRef.current.updateBitmap(e.data.bitmap);
            live3dWarnedRef.current = false;
            setLive3dWarning(false);
          } else if (e.data.dataUrl) {
            compositorRef.current.updateFrameImage(e.data.dataUrl);
            live3dWarnedRef.current = false;
            setLive3dWarning(false);
          }
        }
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
      triggerLiveRun(compiledPrompt.generatedHtmlCode, {
        aspect: exportAspect,
        cfg: settingsRef.current,
        dur: effectiveDurationRef.current,
        switchMobilePreview: false
      });
    }, 280);
    return () => clearTimeout(timer);
  }, [editorTab, compiledPrompt.generatedHtmlCode, exportAspect, triggerLiveRun]);

  const sendLiveSpeed = (spd) => {
    try {
      liveIframeRef.current?.contentWindow?.postMessage({
        type: 'ctv-live-speed',
        speedMultiplier: spd
      }, '*');
    } catch {}
  };

  // Mengubah opsi di StudioCustomPanel otomatis mengaktifkan Kustomisasi (tanpa memaksa 3D TV)
  const handleChangeSetting = useCallback((patch) => {
    setSettings((prev) => {
      const explicit3d = 'stage3d' in patch || patch.frameStyle === '3d-tv';
      const safeBase = prev.pureBypassMode && !explicit3d
        ? {
            ...prev,
            stage3d: false,
            frameStyle: prev.frameStyle === '3d-tv' ? 'full' : (prev.frameStyle || 'full'),
            autoOrbit: false,
            cameraMotion: prev.cameraMotion === 'auto-orbit' ? 'static' : prev.cameraMotion
          }
        : prev;
      const next = { ...safeBase, ...patch, pureBypassMode: false };
      if ('fontFamily' in patch) {
        try {
          liveIframeRef.current?.contentWindow?.postMessage({
            type: 'ctv-live-font',
            fontCss: STUDIO_FONT_PRESETS[patch.fontFamily] || ''
          }, '*');
        } catch {}
      }
      return next;
    });
  }, []);

  const handleToggleBypass = useCallback((bypassOn) => {
    const isBypass = Boolean(bypassOn);
    setSettings((prev) => ({
      ...prev,
      pureBypassMode: isBypass,
      stage3d: false,
      frameStyle: prev.frameStyle === '3d-tv' ? 'full' : (prev.frameStyle || 'full'),
      autoOrbit: false,
      cameraMotion: prev.cameraMotion === 'auto-orbit' ? 'static' : prev.cameraMotion
    }));
    try {
      const fontCss = isBypass ? '' : (STUDIO_FONT_PRESETS[settingsRef.current.fontFamily] || '');
      liveIframeRef.current?.contentWindow?.postMessage({ type: 'ctv-live-font', fontCss }, '*');
      sendLiveSpeed(isBypass ? 1.0 : (settingsRef.current.motionSpeed || 1.0));
    } catch {}
    onShowToast?.(
      isBypass ? 'Mode Polos Murni aktif — semua efek dibatalkan.' : 'Mode Kustomisasi Studio aktif.',
      'info'
    );
  }, [onShowToast]);

  const handleResetAllStudioEffectsToPure = useCallback(() => {
    setSettings({ ...DEFAULT_STUDIO_SETTINGS, pureBypassMode: true });
    try {
      liveIframeRef.current?.contentWindow?.postMessage({ type: 'ctv-live-font', fontCss: '' }, '*');
      sendLiveSpeed(1.0);
    } catch {}
    onShowToast?.('Seluruh pengaturan direset ke Mode Polos Murni.', 'info');
  }, [onShowToast]);

  // Terapkan perubahan kode atau prompt teks ke Live Iframe (auto pindah ke Preview di HP)
  const handleApplyCode = useCallback(() => {
    const targetCode = getActiveSourceCode();
    triggerLiveRun(targetCode, {
      aspect: exportAspect,
      cfg: settingsRef.current,
      dur: effectiveDurationRef.current,
      switchMobilePreview: true
    });
    onShowToast?.('Pratinjau visual berhasil diperbarui.', 'success');
  }, [getActiveSourceCode, exportAspect, triggerLiveRun, onShowToast]);

  const handleGeneratePromptAnimation = () => {
    const dur = effectiveExportDuration;
    const fresh = compileTextPromptToSceneGraph(textPrompt, settings, dur);
    if (settings.autoDuration && fresh.summary.recommendedDuration) {
      setExportDuration(fresh.summary.recommendedDuration);
    }
    triggerLiveRun(fresh.generatedHtmlCode, {
      aspect: exportAspect,
      cfg: settings,
      dur,
      switchMobilePreview: true
    });
    onShowToast?.(
      `Animasi dibuat: ${fresh.summary.topicLabel} (${fresh.summary.sceneCount} adegan • ${fresh.summary.colorName}).`,
      'success'
    );
  };

  // Konversi hasil Editor Teks menjadi kode HTML5 utuh di Editor Kode
  const handleOpenTextInCodeEditor = () => {
    const generatedHtml = compiledPrompt.generatedHtmlCode;
    setUniversalCode(generatedHtml);
    setEditorTab('code');
    triggerLiveRun(generatedHtml, {
      aspect: exportAspect,
      cfg: settingsRef.current,
      dur: effectiveDurationRef.current,
      switchMobilePreview: false
    });
    onShowToast?.('Animasi teks dibuka ke Editor Kode.', 'success');
  };

  // Ganti Template Preset
  const handleSelectTemplate = (templateId) => {
    const tmpl = CODE_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;

    setSelectedTemplateId(templateId);
    setEditorTab('code');

    const nextCode =
      tmpl.category === 'canvas'
        ? tmpl.code
        : buildCompositeHtml(tmpl.html, tmpl.css, tmpl.js);

    setUniversalCode(nextCode);
    triggerLiveRun(nextCode, {
      aspect: exportAspect,
      cfg: settingsRef.current,
      dur: effectiveDurationRef.current,
      switchMobilePreview: false
    });
    onShowToast?.(`Template "${tmpl.name}" aktif.`, 'info');
  };

  // Preset Cepat Komposisi
  const handleQuickPreset = (presetName) => {
    if (presetName === 'clean-full') {
      handleResetAllStudioEffectsToPure();
    } else if (presetName === 'cinematic-full') {
      setSettings((s) => ({
        ...s,
        pureBypassMode: false,
        frameStyle: 'full',
        stage3d: false,
        particles: true,
        particleStyle: 'sparks',
        particleCount: 100,
        vignette: true,
        colorBoost: true,
        shimmerSweep: true
      }));
      onShowToast?.('Preset Sinematik aktif (Full Layar + Partikel + Vignette).', 'info');
    } else if (presetName === 'studio-3d') {
      setSettings((s) => ({
        ...s,
        pureBypassMode: false,
        frameStyle: '3d-tv',
        stage3d: true,
        autoOrbit: true,
        cameraMotion: 'auto-orbit',
        clouds: true,
        particles: true,
        particleStyle: 'petals-stars',
        vignette: false
      }));
      onShowToast?.('Preset Studio 3D aktif (Bingkai TV + Orbit + Awan).', 'info');
    }
  };

  // Salin Kode
  const handleCopyCode = async () => {
    const res = await copyTextToClipboard(getActiveSourceCode());
    if (res.success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShowToast?.('Kode berhasil disalin.', 'success');
    } else {
      onShowToast?.(res.message || 'Gagal menyalin kode.', 'error');
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
      setSettings({ ...DEFAULT_STUDIO_SETTINGS, pureBypassMode: true });
      onShowToast?.('Prompt & seluruh pengaturan Editor Teks dikembalikan ke bawaan.', 'info');
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
    const extMap = {
      'pure-js-standalone': 'js',
      'pure-js-draw': 'js',
      'p5-js': 'js',
      typescript: 'ts',
      'react-jsx': 'jsx',
      'pure-css': 'css',
      'pure-svg': 'svg',
      'glsl-shader': 'glsl',
      'processing-java': 'pde',
      'foreign-anim': 'py',
      'text-prompt': 'txt'
    };
    const ext = extMap[category] || 'html';
    try {
      const dl = downloadText(activeCode, `kuro_studio_${selectedTemplateId}.${ext}`, 'text/plain;charset=utf-8');
      onShowToast?.(`Berkas ${dl.filename} diunduh.`, 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Gagal mengunduh kode.', 'error');
    }
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
          const mergedSettings = {
            ...DEFAULT_STUDIO_SETTINGS,
            ...(restored.promptOptions || {}),
            ...(restored.settings || {})
          };
          setSettings(mergedSettings);
          if (restored.exportOptions) {
            if (restored.exportOptions.res) setExportRes(restored.exportOptions.res);
            if (restored.exportOptions.aspect) setExportAspect(restored.exportOptions.aspect);
            if (restored.exportOptions.fps) setExportFps(Number(restored.exportOptions.fps));
            if (restored.exportOptions.duration) setExportDuration(Number(restored.exportOptions.duration));
            if (restored.exportOptions.bitrate) setExportBitrate(restored.exportOptions.bitrate);
          }
          setEditorTab(restored.editorTab);
          setErrorLog(null);

          const durRestore = Number(restored.exportOptions?.duration) || Number(exportDuration) || 12;
          const aspectRestore = restored.exportOptions?.aspect || exportAspect;
          const nextHtml = restored.editorTab === 'text'
            ? compileTextPromptToSceneGraph(restored.promptInput || textPrompt, mergedSettings, durRestore).generatedHtmlCode
            : restored.universalCode || universalCode;
          triggerLiveRun(nextHtml, {
            aspect: aspectRestore,
            cfg: mergedSettings,
            dur: durRestore,
            switchMobilePreview: false
          });
          onShowToast?.(`Proyek "${file.name}" berhasil dipulihkan.`, 'success');
        } catch (err) {
          onShowToast?.(err.message || 'Gagal membaca file proyek JSON.', 'error');
        }
        return;
      }

      setEditorTab('code');
      setUniversalCode(content);
      triggerLiveRun(content, {
        aspect: exportAspect,
        cfg: settingsRef.current,
        dur: effectiveDurationRef.current,
        switchMobilePreview: false
      });
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

  // Controls Player (Seekable Timeline + Pause/Resume + Restart + Fullscreen CSS Container)
  const seekToTime = useCallback((nextSec) => {
    const maxDur = effectiveDurationRef.current;
    const clamped = Math.max(0, Math.min(maxDur, Number(nextSec) || 0));
    currentTimeSecRef.current = clamped;
    setCurrentTimeSec(clamped);

    const spd = settingsRef.current?.pureBypassMode ? 1.0 : (Number(settingsRef.current?.motionSpeed) || 1.0);
    startTimeRef.current = performance.now() - (clamped * 1000) / Math.max(0.1, spd);

    try {
      liveIframeRef.current?.contentWindow?.postMessage({
        type: 'ctv-seek',
        timeMs: Math.round(clamped * 1000)
      }, '*');
    } catch {}

    renderOverlaysAtTime(clamped, settingsRef.current);
  }, [renderOverlaysAtTime]);

  const handleSeekStart = useCallback(() => {
    isScrubbingRef.current = true;
  }, []);

  const handleSeekChange = useCallback((sec) => {
    isScrubbingRef.current = true;
    seekToTime(sec);
  }, [seekToTime]);

  const handleSeekEnd = useCallback((sec) => {
    isScrubbingRef.current = false;
    seekToTime(sec);
  }, [seekToTime]);

  const handleJumpDelta = useCallback((deltaSec) => {
    seekToTime(currentTimeSecRef.current + (Number(deltaSec) || 0));
  }, [seekToTime]);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      const spd = settingsRef.current?.pureBypassMode ? 1.0 : (Number(settingsRef.current?.motionSpeed) || 1.0);
      if (next) {
        startTimeRef.current = performance.now() - (currentTimeSecRef.current * 1000) / Math.max(0.1, spd);
      }
      try {
        liveIframeRef.current?.contentWindow?.postMessage({
          type: next ? 'ctv-live-resume' : 'ctv-live-pause'
        }, '*');
      } catch {}
      return next;
    });
  }, []);

  const handleRestart = useCallback(() => {
    currentTimeSecRef.current = 0;
    setCurrentTimeSec(0);
    lastIframeTimeReportAtRef.current = 0;
    startTimeRef.current = performance.now();
    setIsPlaying(true);
    try {
      liveIframeRef.current?.contentWindow?.postMessage({
        type: 'ctv-live-restart'
      }, '*');
    } catch {}
    setIframeRunKey((k) => k + 1);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (next) {
        try {
          viewportRef.current?.requestFullscreen?.().catch(() => {});
        } catch {}
      } else if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      return next;
    });
  }, []);

  const buildRenderSignature = useCallback(
    (sourceCode) => `${editorTab}|${exportRes}|${exportAspect}|${exportFps}|${effectiveExportDuration}|${exportBitrate}|${JSON.stringify(settingsRef.current)}|${sourceCode.length}:${sourceCode.slice(0, 64)}`,
    [editorTab, exportRes, exportAspect, exportFps, effectiveExportDuration, exportBitrate]
  );

  // --- MULAI RENDER VIDEO DETERMINISTIK 60 FPS (HINGGA 300 DETIK / 5 MENIT) ---
  const handleStartRender = async () => {
    if (!compositorRef.current) return;

    setIsPlaying(false);
    try {
      liveIframeRef.current?.contentWindow?.postMessage({ type: 'ctv-live-pause' }, '*');
    } catch {}

    setIsRendering(true);
    setRenderResult(null);
    const finalDuration = effectiveExportDuration;
    setRenderProgress({
      frame: 0,
      totalFrames: Math.max(1, Math.round(finalDuration * exportFps)),
      percent: 0,
      timeRemainingSec: 0,
      currentVideoTimeSec: 0,
      totalVideoDurationSec: finalDuration
    });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const targetCode = getActiveSourceCode();

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

      if (autoDownload) {
        const videoFileName = `KuroStudio_${result.width}x${result.height}_${Date.now()}.${result.format}`;
        if (result.blob instanceof Blob && result.blob.size > 0) {
          downloadBlob(result.blob, videoFileName);
        } else if (result.url) {
          downloadFromUrl(result.url, videoFileName).catch(() => {});
        }
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

  const handleDownloadVideo = async () => {
    if (!renderResult) return;
    const videoFileName = `KuroStudio_${renderResult.width}x${renderResult.height}_${Date.now()}.${renderResult.format}`;
    try {
      if (renderResult.blob instanceof Blob && renderResult.blob.size > 0) {
        downloadBlob(renderResult.blob, videoFileName);
      } else if (renderResult.url) {
        await downloadFromUrl(renderResult.url, videoFileName);
      } else {
        throw new Error('Berkas hasil render tidak tersedia.');
      }
      onShowToast?.('Mengunduh video...', 'success');
    } catch (err) {
      onShowToast?.(err.message || 'Gagal mengunduh video.', 'error');
    }
  };

  const triggerBlobDownload = (blob, filename) => {
    downloadBlob(blob, filename);
  };

  const activeSceneTitle = useMemo(() => {
    if (editorTab === 'text') return compiledPrompt.summary.headline || 'Kuro Text Studio';
    const tmpl = CODE_TEMPLATES.find((t) => t.id === selectedTemplateId);
    return settings.hudTitle || tmpl?.name || 'Kuro Code Studio';
  }, [editorTab, compiledPrompt.summary.headline, selectedTemplateId, settings.hudTitle]);

  const handleExportAlightMotion = () => {
    const dur = effectiveExportDuration;
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
    const finalDuration = effectiveExportDuration;

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
        settings: { ...settingsRef.current, hudEnabled: false, watermarkEnabled: false },
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
      promptOptions: settingsRef.current,
      settings: settingsRef.current,
      exportOptions: {
        res: exportRes,
        aspect: exportAspect,
        fps: exportFps,
        duration: effectiveExportDuration,
        bitrate: exportBitrate
      }
    });
    triggerBlobDownload(blob, filename);
    onShowToast?.(`Cadangan proyek (${filename}) disimpan.`, 'success');
  };

  // Ringkasan real-time
  const targetDims = computeTargetDimensions(exportRes, exportAspect);
  const activeBitrateVal = BITRATE_PRESETS[exportBitrate] || 16_000_000;
  const estimatedMB = (((activeBitrateVal * effectiveExportDuration) / 8) / (1024 * 1024)).toFixed(1);

  const lineCount = universalCode.split('\n').length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 pb-28 overflow-x-hidden box-border">
      
      {/* ─── 1. TOP HEADER, KOTAK INFO FITUR & TEMPLATE SELECTOR ─── */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3.5 sm:p-5 space-y-3 min-w-0">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4 min-w-0">
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
                Ubah kode animasi atau teks ide bebas menjadi video sinematik hingga 1440p &amp; durasi 5 menit.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto min-w-0">
            <button
              type="button"
              onClick={() => setShowStudioInfo((v) => !v)}
              className="md:hidden px-2.5 py-2 bg-cyan-200 hover:bg-cyan-300 text-black border-2 border-black shadow-[2px_2px_0px_#000] font-black text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
              title="Lihat Info & Tips Fitur"
            >
              <Info className="w-3.5 h-3.5" />
              <span>{showStudioInfo ? 'Tutup Info' : 'Info & Tips'}</span>
            </button>
            <div className="flex items-center gap-2 flex-1 md:w-72 min-w-0">
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
        </div>

        {/* Kotak Info Fitur & Tips Kualitas */}
        {showStudioInfo && (
          <div className="p-3 bg-yellow-50 border-2 border-black grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
            <div className="flex items-start gap-2 min-w-0">
              <Info className="w-4 h-4 text-black shrink-0 mt-0.5" />
              <p className="text-neutral-800 leading-snug">
                <strong className="font-black text-black">Apa itu fitur ini: </strong>
                Studio animasi video 60 FPS langsung di browser (hingga 1440p &amp; durasi beberapa menit). Ubah kode animasi bahasa apa saja (HTML, CSS, JS, Canvas, SVG, WebGL/GLSL) maupun deskripsi teks ide menjadi video sinematik HD, lengkap dengan ekspor proyek editable ke Alight Motion &amp; CapCut.
              </p>
            </div>
            <div className="flex items-start gap-2 min-w-0 md:border-l-2 md:border-black md:pl-3">
              <Sparkles className="w-4 h-4 text-black shrink-0 mt-0.5" />
              <p className="text-neutral-800 leading-snug">
                <strong className="font-black text-black">Tips hasil terbaik: </strong>
                Semakin detail teks atau kode yang Anda masukkan (sebutkan gaya desain, kode warna #hex, bentukan elemen, alur tiap adegan, harga/poin, serta durasi), semakin kaya, unik, halus, dan keren animasi yang dihasilkan.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── MOBILE SECTION SWITCHER ─── */}
      <div className="grid grid-cols-3 lg:hidden bg-white border-2 border-black shadow-[3px_3px_0px_#000] p-1 gap-1 w-full">
        <button
          onClick={() => setMobileSection('preview')}
          className={`py-2 px-1 text-[10px] sm:text-[11px] font-black uppercase text-center transition-colors truncate ${
            mobileSection === 'preview' ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'
          }`}
        >
          Preview &amp; Kustom
        </button>
        <button
          onClick={() => setMobileSection('editor')}
          className={`py-2 px-1 text-[10px] sm:text-[11px] font-black uppercase text-center transition-colors truncate ${
            mobileSection === 'editor' ? 'bg-black text-white' : 'hover:bg-neutral-100 text-black'
          }`}
        >
          Editor
        </button>
        <button
          onClick={() => setMobileSection('export')}
          className={`py-2 px-1 text-[10px] sm:text-[11px] font-black uppercase text-center transition-colors truncate ${
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
          {/* Header Editor: Tab Editor Kode | Editor Teks */}
          <div className="p-3 bg-neutral-100 border-b-2 border-black space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="grid grid-cols-2 border-2 border-black bg-white shadow-[2px_2px_0px_#000]">
                <button
                  type="button"
                  onClick={() => {
                    setEditorTab('code');
                    triggerLiveRun(universalCode, {
                      aspect: exportAspect,
                      cfg: settingsRef.current,
                      dur: effectiveDurationRef.current,
                      switchMobilePreview: false
                    });
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

              <span className="hidden sm:inline-block text-[10px] bg-neutral-200 border border-black px-2 py-0.5 font-mono font-bold shrink-0">
                Ctrl+Enter: Run
              </span>
            </div>
          </div>

          {/* Isi Panel Kiri: Editor Kode Tunggal ATAU Editor Teks Multi-Adegan */}
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
                placeholder="// Tempel kode HTML, CSS, JS, Three.js, p5.js, GLSL, SVG, TypeScript, Python Manim, atau teks ide video di sini..."
              />
            </div>
          ) : (
            <div className="p-3.5 sm:p-4 bg-white space-y-3.5 max-h-[600px] overflow-y-auto text-xs min-w-0">
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
                        setSettings((prev) => ({
                          ...DEFAULT_STUDIO_SETTINGS,
                          pureBypassMode: true,
                          ...(sample.options?.designStyle ? { visualStyle: sample.options.designStyle } : {}),
                          ...(sample.options?.mood ? { mood: sample.options.mood } : {})
                        }));
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
                    Tulis Ide Video / Naskah Multi-Adegan Anda
                  </label>
                  <span className="text-[10px] font-mono text-neutral-500">
                    {textPrompt.trim().length} karakter
                  </span>
                </div>
                <textarea
                  value={textPrompt}
                  onChange={(e) => setTextPrompt(e.target.value)}
                  placeholder={'Ceritakan desain, warna #hex, struktur adegan (Adegan 1, Adegan 2...), poin fitur, harga, dan ajakan CTA...\nMendukung video singkat 5 detik hingga naskah 5 menit!\nAtur seluruh gaya, warna, partikel, HUD, dan kamera lewat Panel Kustomisasi Studio.'}
                  className="w-full min-h-[240px] sm:min-h-[295px] p-3 bg-neutral-50 border-2 border-black font-semibold text-xs sm:text-sm leading-relaxed resize-y focus:bg-white focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              {/* Telemetri Parsing Otomatis */}
              <div className="p-2.5 bg-cyan-50 border-2 border-black flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="px-2 py-0.5 bg-black text-white font-black uppercase">
                  {compiledPrompt.summary.topicLabel}
                </span>
                <span className="px-2 py-0.5 bg-white border border-black font-bold">
                  Brand: {compiledPrompt.summary.brand}
                </span>
                <span className="px-2 py-0.5 bg-yellow-300 border border-black font-black">
                  {compiledPrompt.summary.sceneCount} Adegan
                </span>
                <span className="px-2 py-0.5 bg-white border border-black font-bold">
                  Mood: {compiledPrompt.summary.colorName}
                </span>
                {compiledPrompt.summary.hexColors?.length > 0 && (
                  <span className="px-2 py-0.5 bg-white border border-black font-mono flex items-center gap-1">
                    {compiledPrompt.summary.hexColors.slice(0, 4).map((hx) => (
                      <span key={hx} className="w-3 h-3 rounded-full border border-black inline-block" style={{ background: hx }} title={hx} />
                    ))}
                    <span>Hex</span>
                  </span>
                )}
              </div>

              <p className="text-[11px] font-semibold text-neutral-600 bg-neutral-50 border border-black p-2">
                Tip: Gunakan <strong>Panel Kustomisasi Studio</strong> di bawah preview untuk mengubah warna, pola latar, gaya kartu, font, efek partikel, dan transisi kapan saja.
              </p>

              {/* Tombol Aksi Prompt Compiler */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleGeneratePromptAnimation}
                  className="py-2.5 px-3 bg-cyan-300 hover:bg-cyan-200 text-black border-2 border-black shadow-[2px_2px_0px_#000] font-black text-xs flex items-center justify-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
                >
                  <Wand2 className="w-4 h-4" />
                  Generate Animasi ({compiledPrompt.summary.sceneCount} Adegan)
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
              accept=".html,.htm,.js,.jsx,.ts,.tsx,.py,.pde,.lua,.txt,.css,.svg,.glsl,.frag,.json,.kurovid.json"
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

          {/* Container Layar + Kontrol Eksternal (Berubah menjadi Fullscreen Cinema Container saat Fullscreen) */}
          <div
            ref={viewportRef}
            className={
              isFullscreen
                ? 'fixed inset-0 z-[9999] bg-neutral-950 flex flex-col w-screen h-[100dvh] overflow-hidden'
                : 'space-y-3 min-w-0'
            }
          >
            {/* 1. KOTAK LAYAR PREVIEW 100% MURNI (ZERO CONTROLS INSIDE & ZERO LETTERBOX OVERFLOW) */}
            <div
              className={
                isFullscreen
                  ? 'flex-1 min-h-0 w-full flex items-center justify-center p-2 sm:p-4 overflow-hidden'
                  : `w-full bg-neutral-950 border-2 border-black shadow-[4px_4px_0px_#000] overflow-hidden ${
                      virtualDims.height > virtualDims.width ? 'flex justify-center' : ''
                    }`
              }
            >
              <div
                ref={stageOuterRef}
                className={
                  isFullscreen
                    ? 'w-full h-full relative flex items-center justify-center overflow-hidden'
                    : virtualDims.height > virtualDims.width
                    ? 'relative flex items-center justify-center bg-neutral-950 overflow-hidden mx-auto h-[420px] sm:h-[480px] lg:h-[520px] max-w-full'
                    : 'w-full relative flex items-center justify-center bg-neutral-950 overflow-hidden'
                }
                style={
                  isFullscreen
                    ? undefined
                    : virtualDims.height > virtualDims.width
                    ? { aspectRatio: exportAspect.replace(':', '/'), width: 'auto', maxWidth: '100%' }
                    : { aspectRatio: exportAspect.replace(':', '/') }
                }
              >
                {/* Mode Layar Penuh / Bingkai Kustom: Panggung Virtual HD Tersekalakan */}
                {(settings.pureBypassMode || (settings.frameStyle !== '3d-tv' && !settings.stage3d)) ? (
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
                        position: 'relative',
                        background:
                          !settings.pureBypassMode && (settings.frameStyle === 'neo-brutalist' || settings.frameStyle === 'glass')
                            ? settings.bgType === 'solid'
                              ? settings.bgColor1
                              : `linear-gradient(135deg, ${settings.bgColor1}, ${settings.bgColor2})`
                            : 'transparent'
                      }}
                    >
                      <div
                        ref={stageContentWrapRef}
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          width: '100%',
                          height: '100%',
                          overflow: 'hidden',
                          zIndex: 1
                        }}
                      >
                        {isPreviewVisible && (
                          <iframe
                            key={`live-stage-${iframeRunKey}-2d`}
                            ref={liveIframeRef}
                            srcDoc={compiledLiveHtml}
                            sandbox="allow-scripts"
                            onLoad={() => {
                              liveCaptureInFlightRef.current = false;
                              syncIframeViewport(virtualDims);
                            }}
                            className="border-0"
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              pointerEvents: isRendering || bundleExportState.active ? 'none' : 'auto'
                            }}
                            title="Live Animation Stage"
                          />
                        )}
                      </div>
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
                    {isPreviewVisible && (
                      <iframe
                        key={`live-stage-${iframeRunKey}-3d`}
                        ref={liveIframeRef}
                        srcDoc={compiledLiveHtml}
                        sandbox="allow-scripts"
                        onLoad={() => {
                          liveCaptureInFlightRef.current = false;
                          if (compositorRef.current) {
                            compositorRef.current.resetFrameTracking();
                          }
                          syncIframeViewport(virtualDims);
                        }}
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
                    )}
                    <canvas
                      ref={canvasRef}
                      className="w-full h-full object-contain rounded-sm relative"
                      style={{ zIndex: 1 }}
                    />
                  </>
                )}
              </div>
            </div>

            {/* 2. PANEL KONTROL EKSTERNAL TERPADU (DI LUAR LAYAR — MOBILE, PC & FULLSCREEN) */}
            <div className={isFullscreen ? 'shrink-0 w-full px-2 sm:px-4 pb-3 pt-1' : 'w-full'}>
              <PreviewControlBar
                isPlaying={isPlaying}
                currentTimeSec={currentTimeSec}
                durationSec={effectiveExportDuration}
                fps={fpsDisplay}
                aspectRatio={exportAspect}
                virtualDims={virtualDims}
                modeLabel={settings.pureBypassMode ? 'Polos' : is3dMode ? '3D TV' : 'Kustom'}
                isFullscreen={isFullscreen}
                onTogglePlay={handleTogglePlay}
                onRestart={handleRestart}
                onSeekStart={handleSeekStart}
                onSeekChange={handleSeekChange}
                onSeekEnd={handleSeekEnd}
                onJumpDelta={handleJumpDelta}
                onToggleFullscreen={handleToggleFullscreen}
              />
            </div>

            {/* Banner Error / Peringatan 3D Capture tepat di bawah Kontrol */}
            {errorLog && (
              <div className="w-full p-2.5 bg-red-100 border-2 border-red-500 text-red-950 font-mono text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="min-w-0 break-words">
                  <span className="font-bold">Runtime Error:</span> {errorLog}
                </div>
              </div>
            )}
            {is3dMode && live3dWarning && !errorLog && (
              <div className="w-full p-2.5 bg-amber-100 border-2 border-amber-500 text-amber-950 text-[11px] font-semibold flex items-start justify-between gap-2">
                <span>
                  Pratinjau 3D TV sedang menunggu frame sandbox. Jika perangkat membatasi capture live 3D, beralih ke <strong>Fullscreen / Sinematik</strong>.
                </span>
                <button
                  type="button"
                  onClick={() => handleQuickPreset('clean-full')}
                  className="px-2 py-1 bg-white border border-black font-black text-[10px] shrink-0 cursor-pointer"
                >
                  Ke 2D
                </button>
              </div>
            )}
          </div>

          {/* PANEL KUSTOMISASI TERPADU (DIPAKAI BERSAMA EDITOR KODE & EDITOR TEKS) */}
          <StudioCustomPanel
            editorTab={editorTab}
            settings={settings}
            onChangeSetting={handleChangeSetting}
            onToggleBypass={handleToggleBypass}
            onResetToPure={handleResetAllStudioEffectsToPure}
            recommendedDuration={compiledPrompt.summary.recommendedDuration}
            onSendLiveSpeed={sendLiveSpeed}
            onSyncTextDuration={() => {
              const rec = compiledPrompt.summary.recommendedDuration || 12;
              handleChangeSetting({ autoDuration: true });
              setExportDuration(rec);
              onShowToast?.(`Durasi disinkronkan dengan teks: ${rec}s.`, 'info');
            }}
          />
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
              onChange={(e) => {
                const nextAspect = e.target.value;
                setExportAspect(nextAspect);
                if (editorTab === 'code') {
                  triggerLiveRun(universalCode, {
                    aspect: nextAspect,
                    cfg: settingsRef.current,
                    dur: effectiveDurationRef.current,
                    switchMobilePreview: false
                  });
                }
              }}
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

          {/* Durasi Fleksibel 3 Detik s.d. 300 Detik (5 Menit) */}
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <label className="font-black uppercase tracking-wider text-neutral-700 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Durasi Video (3s &ndash; 300s / 5 Menit):
              </label>
              <span className="font-mono text-[11px] font-black px-2 py-0.5 bg-neutral-100 border border-black">
                {effectiveExportDuration}s = {formatSecondsToMmSs(effectiveExportDuration)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <input
                type="number"
                min="3"
                max="300"
                step="1"
                value={effectiveExportDuration}
                onChange={(e) => {
                  const next = Math.max(3, Math.min(300, Number(e.target.value) || 12));
                  setSettings((p) => ({ ...p, autoDuration: false }));
                  setExportDuration(next);
                }}
                disabled={isRendering || bundleExportState.active}
                className="w-20 bg-white border-2 border-black p-2 font-bold font-mono text-xs shadow-[2px_2px_0px_#000] focus:outline-none min-h-[40px]"
              />
              <div className="flex gap-1 flex-wrap">
                {[
                  { sec: 10, label: '10s' },
                  { sec: 15, label: '15s' },
                  { sec: 30, label: '30s' },
                  { sec: 60, label: '60s (1m)' },
                  { sec: 120, label: '120s (2m)' },
                  { sec: 180, label: '180s (3m)' },
                  { sec: 300, label: '300s (5m)' }
                ].map((p) => (
                  <button
                    key={p.sec}
                    type="button"
                    onClick={() => {
                      setSettings((prev) => ({ ...prev, autoDuration: false }));
                      setExportDuration(p.sec);
                    }}
                    disabled={isRendering || bundleExportState.active}
                    className={`px-2 py-1 text-[10px] sm:text-[11px] font-bold border border-black cursor-pointer ${
                      Number(effectiveExportDuration) === p.sec ? 'bg-black text-white' : 'bg-neutral-100 hover:bg-neutral-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const rec = compiledPrompt.summary.recommendedDuration || 12;
                    setSettings((prev) => ({ ...prev, autoDuration: true }));
                    setExportDuration(rec);
                    onShowToast?.(`Durasi mengikuti naskah Editor Teks: ${rec}s (${formatSecondsToMmSs(rec)}).`, 'info');
                  }}
                  disabled={isRendering || bundleExportState.active}
                  className="px-2 py-1 text-[10px] sm:text-[11px] font-black border border-black bg-cyan-200 hover:bg-cyan-300 cursor-pointer"
                >
                  Ikuti Durasi Teks ({compiledPrompt.summary.recommendedDuration}s)
                </button>
              </div>
            </div>
          </div>

          {/* Kualitas Bitrate */}
          <div className="space-y-1.5">
            <label className="font-black uppercase tracking-wider text-neutral-700">Bitrate Kualitas:</label>
            <select
              value={exportBitrate}
              onChange={(e) => setExportBitrate(e.target.value)}
              disabled={isRendering || bundleExportState.active}
              className="w-full bg-white border-2 border-black p-2 font-bold shadow-[2px_2px_0px_#000] focus:outline-none min-h-[40px] cursor-pointer"
            >
              <option value="light">Ringan (4 Mbps)</option>
              <option value="standard">Standar (8 Mbps)</option>
              <option value="high">Tinggi (16 Mbps)</option>
              <option value="ultra">Ultra (26 Mbps)</option>
            </select>
          </div>
        </div>

        {/* Catatan Info Non-Blokir untuk Render Berat */}
        {effectiveExportDuration > 60 && exportRes === '1440p' && exportFps >= 60 && (
          <div className="p-2.5 bg-amber-50 border border-black text-[11px] font-semibold text-amber-950 flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0 text-amber-700" />
            <span>
              Info: Render durasi panjang ({formatSecondsToMmSs(effectiveExportDuration)}) pada 1440p 60 FPS menghasilkan ukuran file sekitar {estimatedMB} MB &amp; membutuhkan waktu komputasi ekstra di perangkat.
            </span>
          </div>
        )}

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
            Mulai Render Video ({targetDims.width}&times;{targetDims.height} &bull; {exportFps} FPS &bull; {effectiveExportDuration}s)
          </button>
        )}

        {/* Status Render Aktif */}
        {isRendering && (
          <div className="p-4 bg-yellow-50 border-2 border-black space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 font-bold text-xs">
              <span className="flex items-center gap-2 text-black flex-wrap">
                <span className="w-3 h-3 rounded-full bg-yellow-500 animate-ping inline-block shrink-0" />
                <span>
                  Frame {renderProgress.frame} / {renderProgress.totalFrames} ({renderProgress.percent}%)
                  &bull; Waktu Video {formatSecondsToMmSs(renderProgress.currentVideoTimeSec || 0)} / {formatSecondsToMmSs(renderProgress.totalVideoDurationSec || effectiveExportDuration)}
                </span>
              </span>
              <span className="font-mono text-neutral-600 shrink-0">
                Estimasi sisa: ~{renderProgress.timeRemainingSec}s
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
