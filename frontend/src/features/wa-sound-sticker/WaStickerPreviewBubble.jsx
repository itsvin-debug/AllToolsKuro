import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Volume2, Video, Sparkles, CheckCheck, Info } from 'lucide-react';
import { renderStickerCanvasFrame } from './webpStickerEncoder';
import { createSnippetPlayer } from './audioTrimmerEngine';

function formatShortSec(sec = 0) {
  const safe = Math.max(0, Number(sec) || 0);
  const mins = Math.floor(safe / 60);
  const rem = (safe % 60).toFixed(1).padStart(4, '0');
  return `${mins}:${rem}`;
}

/**
 * Simulasi Live Preview Bubble Chat WhatsApp Sinkron Visual 512x512 + Potongan Sound
 */
export default function WaStickerPreviewBubble({
  sourceMedia,
  isVideoSource,
  audioBuffer,
  waveformPeaks = [],
  startSec = 0,
  endSec = 5,
  volume = 1.0,
  fadeSmooth = true,
  renderOptions = {},
  deliveryMode = 'combo',
  onChangeDeliveryMode,
  useCircularPtv = false,
  onToggleCircularPtv
}) {
  const canvasRef = useRef(null);
  const playerRef = useRef(null);
  const rafRef = useRef(0);
  const isPlayingRef = useRef(false);
  const elapsedRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const clipDuration = Math.max(0.2, (Number(endSec) || 0) - (Number(startSec) || 0));

  useEffect(() => {
    playerRef.current = createSnippetPlayer();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      playerRef.current?.stop();
    };
  }, []);

  // Draw frame visual sinkron dengan detik berjalan (atau frame diam saat paused)
  const drawFrame = useCallback(
    (tInsideClip = elapsedRef.current) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { alpha: true });

      const pulseIdx = waveformPeaks.length > 0
        ? Math.min(waveformPeaks.length - 1, Math.floor((tInsideClip / Math.max(0.2, clipDuration)) * waveformPeaks.length))
        : 0;
      const audioPulse = isPlayingRef.current ? (waveformPeaks[pulseIdx] || 0.2) : 0;

      renderStickerCanvasFrame(
        ctx,
        sourceMedia,
        {
          ...renderOptions,
          audioPulse,
          forVideoBackground: deliveryMode === 'video-note'
        },
        tInsideClip
      );
    },
    [sourceMedia, renderOptions, waveformPeaks, clipDuration, deliveryMode]
  );

  // Perbarui canvas langsung ketika pengaturan stiker/foto/teks berubah
  useEffect(() => {
    if (!isPlayingRef.current) {
      drawFrame(elapsedRef.current);
    }
  }, [drawFrame, sourceMedia, renderOptions, startSec, endSec]);

  const stopPreview = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    playerRef.current?.stop();
    if (isVideoSource && sourceMedia) {
      try {
        sourceMedia.pause();
      } catch {}
    }
  }, [isVideoSource, sourceMedia]);

  // Reset saat sumber media atau rentang potongan berubah
  useEffect(() => {
    stopPreview();
    elapsedRef.current = 0;
    setElapsedSec(0);
    drawFrame(0);
  }, [sourceMedia, audioBuffer, startSec, endSec, stopPreview, drawFrame]);

  const startVisualLoop = useCallback((initialOffset = 0) => {
    const startWall = performance.now();
    const tick = () => {
      if (!isPlayingRef.current) return;
      const t = initialOffset + (performance.now() - startWall) / 1000;
      if (t >= clipDuration) {
        elapsedRef.current = clipDuration;
        setElapsedSec(clipDuration);
        drawFrame(clipDuration);
        if (!audioBuffer) {
          stopPreview();
        }
        return;
      }
      elapsedRef.current = t;
      setElapsedSec(t);
      drawFrame(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [clipDuration, drawFrame, audioBuffer, stopPreview]);

  const handleTogglePlay = async () => {
    if (isPlayingRef.current) {
      stopPreview();
      return;
    }
    if (!sourceMedia && !audioBuffer) return;

    const resumeOffset = elapsedRef.current >= clipDuration - 0.08 ? 0 : elapsedRef.current;
    elapsedRef.current = resumeOffset;
    setElapsedSec(resumeOffset);
    isPlayingRef.current = true;
    setIsPlaying(true);

    if (isVideoSource && sourceMedia) {
      try {
        const vidDur = Number.isFinite(sourceMedia.duration) && sourceMedia.duration > 0 ? sourceMedia.duration : clipDuration;
        sourceMedia.muted = true;
        sourceMedia.loop = true;
        sourceMedia.currentTime = resumeOffset % vidDur;
        await sourceMedia.play();
      } catch {}
    }

    startVisualLoop(resumeOffset);

    if (audioBuffer) {
      playerRef.current?.play(audioBuffer, startSec, endSec, volume, {
        offsetInside: resumeOffset,
        fadeSmooth,
        onTick: (sec) => {
          elapsedRef.current = sec;
        },
        onEnded: () => {
          stopPreview();
          elapsedRef.current = 0;
          setElapsedSec(0);
          drawFrame(0);
        }
      });
    }
  };

  const handleRestartPreview = () => {
    stopPreview();
    elapsedRef.current = 0;
    setElapsedSec(0);
    drawFrame(0);
    setTimeout(() => {
      handleTogglePlay();
    }, 30);
  };

  const handleScrubPreview = (nextSec) => {
    const clamped = Math.max(0, Math.min(clipDuration, Number(nextSec) || 0));
    if (isPlayingRef.current) stopPreview();
    elapsedRef.current = clamped;
    setElapsedSec(clamped);
    if (isVideoSource && sourceMedia) {
      const vidDur = Number.isFinite(sourceMedia.duration) && sourceMedia.duration > 0 ? sourceMedia.duration : clipDuration;
      try {
        sourceMedia.currentTime = clamped % vidDur;
      } catch {}
    }
    drawFrame(clamped);
  };

  const miniBars = waveformPeaks.length > 0
    ? Array.from({ length: 24 }, (_, idx) => {
        const srcIdx = Math.min(waveformPeaks.length - 1, Math.floor((idx / 24) * waveformPeaks.length));
        return waveformPeaks[srcIdx];
      })
    : new Array(24).fill(0.35);

  const progressRatio = Math.max(0, Math.min(1, elapsedSec / Math.max(0.2, clipDuration)));

  return (
    <div className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3 sm:p-4 space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-black">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 bg-emerald-400 border border-black font-black text-[10px] uppercase shrink-0">
            Langkah 3
          </span>
          <h3 className="font-black text-xs sm:text-sm uppercase text-black truncate">
            Simulasi Chat Stiker Suara WA
          </h3>
        </div>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-neutral-100 border border-black shrink-0">
          512&times;512
        </span>
      </div>

      {/* Pilihan Mode Pengiriman */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px]">
        <button
          type="button"
          onClick={() => onChangeDeliveryMode?.('combo')}
          className={`p-2 border-2 border-black font-black text-left transition-all cursor-pointer ${
            deliveryMode === 'combo'
              ? 'bg-emerald-300 shadow-[2px_2px_0px_#000]'
              : 'bg-white hover:bg-neutral-100'
          }`}
        >
          <div className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Stiker + Sound</span>
          </div>
          <span className="text-[10px] font-semibold text-neutral-700 block">Combo Rekomendasi</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeDeliveryMode?.('video-note')}
          className={`p-2 border-2 border-black font-black text-left transition-all cursor-pointer ${
            deliveryMode === 'video-note'
              ? 'bg-cyan-300 shadow-[2px_2px_0px_#000]'
              : 'bg-white hover:bg-neutral-100'
          }`}
        >
          <div className="flex items-center gap-1">
            <Video className="w-3.5 h-3.5 shrink-0" />
            <span>Video Bersuara</span>
          </div>
          <span className="text-[10px] font-semibold text-neutral-700 block">1 File Video / PTV</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeDeliveryMode?.('both')}
          className={`p-2 border-2 border-black font-black text-left transition-all cursor-pointer ${
            deliveryMode === 'both'
              ? 'bg-yellow-300 shadow-[2px_2px_0px_#000]'
              : 'bg-white hover:bg-neutral-100'
          }`}
        >
          <div className="flex items-center gap-1">
            <Volume2 className="w-3.5 h-3.5 shrink-0" />
            <span>Kirim Keduanya</span>
          </div>
          <span className="text-[10px] font-semibold text-neutral-700 block">Stiker + Video MP4</span>
        </button>
      </div>

      {(deliveryMode === 'video-note' || deliveryMode === 'both') && (
        <label className="flex items-center justify-between gap-2 px-2.5 py-2 bg-cyan-50 border border-black text-[11px] font-bold cursor-pointer">
          <span>Kirim Video dalam bentuk Lingkaran Video Note WA (PTV Bulat)</span>
          <input
            type="checkbox"
            checked={useCircularPtv}
            onChange={(e) => onToggleCircularPtv?.(e.target.checked)}
            className="w-4 h-4 accent-black cursor-pointer"
          />
        </label>
      )}

      {/* Simulasi Chat Bubble WhatsApp (Latar Terang Wallpaper Chat WA) */}
      <div
        className="border-2 border-black p-3 sm:p-4 space-y-2.5 relative overflow-hidden"
        style={{
          backgroundColor: '#efeae2',
          backgroundImage: 'radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)',
          backgroundSize: '14px 14px'
        }}
      >
        <div className="flex items-center justify-between text-[10px] font-mono font-bold text-neutral-700 pb-1 border-b border-black/15">
          <span>Chat Diri Sendiri (You)</span>
          <span>{isPlaying ? 'MEMUTAR SINKRON...' : 'SIAP DIPRATINJAU'}</span>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {/* Stiker / Video Visual Preview */}
          <div
            onClick={handleTogglePlay}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTogglePlay(); } }}
            className="cursor-pointer group relative inline-flex flex-col items-end"
            title="Klik untuk putar/jeda preview stiker suara"
          >
            <div
              className={`relative overflow-hidden border-2 border-black/80 shadow-[3px_3px_0px_rgba(0,0,0,0.35)] transition-transform group-active:scale-95 ${
                deliveryMode === 'video-note' && useCircularPtv
                  ? 'rounded-full bg-neutral-900'
                  : 'rounded-2xl'
              } ${deliveryMode !== 'video-note' && renderOptions.bgStyle === 'transparent' ? 'bg-transparent' : 'bg-white'}`}
              style={
                deliveryMode !== 'video-note' && renderOptions.bgStyle === 'transparent'
                  ? {
                      backgroundImage: 'linear-gradient(45deg, rgba(0,0,0,0.06) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.06) 75%), linear-gradient(45deg, rgba(0,0,0,0.06) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.06) 75%)',
                      backgroundPosition: '0 0, 8px 8px',
                      backgroundSize: '16px 16px'
                    }
                  : undefined
              }
            >
              <canvas
                ref={canvasRef}
                width={512}
                height={512}
                className="w-40 h-40 sm:w-48 sm:h-48 block object-contain"
              />
              {!sourceMedia && (
                <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] font-bold text-neutral-600 bg-white/85">
                  Pilih Foto / Video di Langkah 1 untuk melihat pratinjau
                </div>
              )}
              <span className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] font-mono flex items-center gap-0.5">
                {formatShortSec(elapsedSec)} <CheckCheck className="w-3 h-3 text-sky-400" />
              </span>
            </div>
          </div>

          {/* Bubble Reply Voice / Sound untuk Mode Combo atau Kirim Keduanya */}
          {deliveryMode !== 'video-note' && (
            <div className="bg-[#d9fdd3] border border-black rounded-2xl rounded-tr-sm px-2.5 py-2 shadow-[2px_2px_0px_rgba(0,0,0,0.25)] max-w-[270px] w-full flex items-center gap-2">
              <button
                type="button"
                onClick={handleTogglePlay}
                disabled={!audioBuffer && !sourceMedia}
                className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white border border-black flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-40"
                aria-label={isPlaying ? 'Jeda Sound' : 'Putar Sound'}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white ml-0.5" />}
              </button>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-[2px] h-5">
                  {miniBars.map((amp, i) => {
                    const active = i / miniBars.length <= progressRatio;
                    return (
                      <span
                        key={i}
                        style={{ height: `${Math.max(22, Math.round(amp * 100))}%` }}
                        className={`flex-1 rounded-full transition-colors ${
                          active ? 'bg-emerald-700' : 'bg-emerald-900/25'
                        }`}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono font-bold text-neutral-700">
                  <span>{formatShortSec(elapsedSec)} / {formatShortSec(clipDuration)}</span>
                  <span className="flex items-center gap-0.5">
                    Sound Potongan <CheckCheck className="w-3 h-3 text-sky-600" />
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Kontrol Putar Sinkron & Scrubber Detik */}
      <div className="space-y-2 bg-neutral-50 border-2 border-black p-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTogglePlay}
            disabled={!sourceMedia && !audioBuffer}
            className="flex-1 py-2 px-3 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 text-black border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black" />}
            <span>{isPlaying ? 'Jeda Preview' : 'Putar Preview Stiker Suara'}</span>
          </button>

          <button
            type="button"
            onClick={handleRestartPreview}
            disabled={!sourceMedia && !audioBuffer}
            className="p-2 bg-white hover:bg-neutral-100 disabled:opacity-40 border-2 border-black shadow-[2px_2px_0px_#000] cursor-pointer"
            title="Putar ulang preview dari awal potongan"
            aria-label="Putar ulang preview"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono font-bold">
          <span>{formatShortSec(elapsedSec)}</span>
          <input
            type="range"
            min={0}
            max={clipDuration}
            step={0.05}
            value={Math.min(clipDuration, elapsedSec)}
            onChange={(e) => handleScrubPreview(e.target.value)}
            className="flex-1 accent-black cursor-pointer h-2"
            aria-label="Cek detik preview stiker suara"
          />
          <span>{formatShortSec(clipDuration)}</span>
        </div>
      </div>

      {/* Catatan Jujur Keterbatasan Teknis Format Stiker WA */}
      <div className="p-2.5 bg-amber-50 border border-black text-[11px] font-semibold text-neutral-800 flex items-start gap-2">
        <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <span>
          Info WA: Stiker .webp resmi WA tidak memuat audio di dalam file gambarnya, sehingga fitur ini menyediakan opsi Stiker Asli + Sound maupun 1-File Video Stiker Bersuara agar langsung berbunyi &amp; bisa diteruskan di WA.
        </span>
      </div>
    </div>
  );
}
