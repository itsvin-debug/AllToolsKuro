import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, RotateCcw, CheckCheck } from 'lucide-react';
import { renderStickerCanvasFrame } from './soundStickerComposer';
import { createSnippetPlayer } from './audioTrimmerEngine';

function formatShortSec(sec = 0) {
  const safe = Math.max(0, Number(sec) || 0);
  const mins = Math.floor(safe / 60);
  const rem = (safe % 60).toFixed(1).padStart(4, '0');
  return `${mins}:${rem}`;
}

/**
 * Simulasi Pratinjau Stiker Suara WA Terbaru (Objek Kotak 1:1 tanpa Bingkai Bubble,
 * Badge Speaker Mute/Unmute di Pojok Kiri Atas, Pill Timestamp Melayang di Bawah).
 */
export default function WaSoundStickerPreview({
  sourceMedia,
  isVideoSource,
  audioBuffer,
  waveformPeaks = [],
  startSec = 0,
  endSec = 5,
  volume = 1.0,
  fadeSmooth = true,
  renderOptions = {}
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

  const drawFrame = useCallback(
    (tInsideClip = elapsedRef.current) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { alpha: true });

      const pulseIdx = waveformPeaks.length > 0
        ? Math.min(waveformPeaks.length - 1, Math.floor((tInsideClip / Math.max(0.2, clipDuration)) * waveformPeaks.length))
        : 0;
      const audioPulse = isPlayingRef.current ? (waveformPeaks[pulseIdx] || 0.25) : 0;

      renderStickerCanvasFrame(
        ctx,
        sourceMedia,
        { ...renderOptions, audioPulse, forVideoBackground: false },
        tInsideClip
      );
    },
    [sourceMedia, renderOptions, waveformPeaks, clipDuration]
  );

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
      try { sourceMedia.pause(); } catch {}
    }
  }, [isVideoSource, sourceMedia]);

  useEffect(() => {
    stopPreview();
    elapsedRef.current = 0;
    setElapsedSec(0);
    drawFrame(0);
  }, [sourceMedia, audioBuffer, startSec, endSec, stopPreview, drawFrame]);

  const startPlaybackCycle = useCallback(
    async (initialOffset = 0) => {
      if (!sourceMedia && !audioBuffer) return;

      const resumeOffset = initialOffset >= clipDuration - 0.08 ? 0 : initialOffset;
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

      const startWall = performance.now();
      const tick = () => {
        if (!isPlayingRef.current) return;
        const t = resumeOffset + (performance.now() - startWall) / 1000;
        if (t >= clipDuration) {
          elapsedRef.current = clipDuration;
          setElapsedSec(clipDuration);
          drawFrame(clipDuration);
          if (!audioBuffer) {
            // Loop mulus jika hanya visual foto/video
            startPlaybackCycle(0);
          }
          return;
        }
        elapsedRef.current = t;
        setElapsedSec(t);
        drawFrame(t);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      if (audioBuffer) {
        playerRef.current?.play(audioBuffer, startSec, endSec, volume, {
          offsetInside: resumeOffset,
          fadeSmooth,
          onTick: (sec) => {
            elapsedRef.current = sec;
          },
          onEnded: () => {
            if (!isPlayingRef.current) return;
            // Loop mulus seperti perilaku stiker suara WA saat suara di-unmute
            startPlaybackCycle(0);
          }
        });
      }
    },
    [sourceMedia, audioBuffer, clipDuration, isVideoSource, drawFrame, startSec, endSec, volume, fadeSmooth]
  );

  const handleToggleSound = () => {
    if (isPlayingRef.current) {
      stopPreview();
      return;
    }
    startPlaybackCycle(0);
  };

  const handleRestart = () => {
    stopPreview();
    elapsedRef.current = 0;
    setElapsedSec(0);
    drawFrame(0);
    setTimeout(() => {
      startPlaybackCycle(0);
    }, 30);
  };

  const handleScrub = (nextSec) => {
    const clamped = Math.max(0, Math.min(clipDuration, Number(nextSec) || 0));
    if (isPlayingRef.current) stopPreview();
    elapsedRef.current = clamped;
    setElapsedSec(clamped);
    if (isVideoSource && sourceMedia) {
      const vidDur = Number.isFinite(sourceMedia.duration) && sourceMedia.duration > 0 ? sourceMedia.duration : clipDuration;
      try { sourceMedia.currentTime = clamped % vidDur; } catch {}
    }
    drawFrame(clamped);
  };

  const progressPct = Math.max(0, Math.min(100, (elapsedSec / Math.max(0.2, clipDuration)) * 100));

  return (
    <div className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-3 sm:p-4 space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2 pb-2 border-b-2 border-black">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 bg-emerald-400 border border-black font-black text-[10px] uppercase shrink-0">
            Pratinjau
          </span>
          <h3 className="font-black text-xs sm:text-sm uppercase text-black truncate">
            Stiker Suara WA
          </h3>
        </div>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-neutral-100 border border-black shrink-0">
          1:1 &bull; 512px
        </span>
      </div>

      {/* Panggung Simulasi Chat WhatsApp Terbaru (Wallpaper Biru-Abu Lembut + Objek Stiker Kotak Tanpa Bubble) */}
      <div
        className="border-2 border-black p-4 sm:p-5 flex flex-col items-end justify-center relative overflow-hidden min-h-[270px]"
        style={{
          background: 'linear-gradient(155deg, #6b889c 0%, #577387 52%, #4a6578 100%)'
        }}
      >
        <div className="w-full flex items-center justify-between text-[10px] font-mono font-bold text-white/85 pb-3">
          <span>Chat Diri Sendiri (You)</span>
          <span>{isPlaying ? 'SUARA AKTIF' : 'KETUK STIKER UNTUK SUARA'}</span>
        </div>

        {/* OBJEK STIKER SUARA TUNGGAL: Kotak 1:1 TANPA bingkai bubble chat */}
        <div className="flex flex-col items-end select-none">
          <div
            onClick={handleToggleSound}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggleSound();
              }
            }}
            className="relative w-52 h-52 sm:w-56 sm:h-56 rounded-lg overflow-hidden cursor-pointer group active:scale-[0.98] transition-transform"
            title="Ketuk stiker atau ikon pojok kiri atas untuk nyalakan/matikan suara"
            aria-label={isPlaying ? 'Matikan suara stiker' : 'Putar suara stiker'}
          >
            <canvas
              ref={canvasRef}
              width={512}
              height={512}
              className="w-full h-full block object-cover"
            />

            {!sourceMedia && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs font-bold text-neutral-800 bg-white/85">
                Pilih Foto / Video di Langkah 1 untuk melihat pratinjau Stiker Suara WA
              </div>
            )}

            {/* Ikon Speaker Bulat Gelap di Pojok Kiri Atas Persis WA Terbaru */}
            <span
              className={`absolute top-2.5 left-2.5 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm transition-all ${
                isPlaying
                  ? 'bg-emerald-600/85 text-white ring-2 ring-white/80 animate-pulse'
                  : 'bg-black/55 text-white'
              }`}
            >
              {isPlaying ? (
                <Volume2 className="w-4 h-4 stroke-[2.4]" />
              ) : (
                <VolumeX className="w-4 h-4 stroke-[2.4]" />
              )}
            </span>

            {/* Garis progres tipis halus saat suara menyala */}
            {isPlaying && (
              <div className="absolute bottom-0 inset-x-0 h-1 bg-black/30">
                <div
                  style={{ width: `${progressPct}%` }}
                  className="h-full bg-emerald-400 transition-[width] duration-75"
                />
              </div>
            )}
          </div>

          {/* Pill Timestamp Melayang di Pojok Kanan Bawah Stiker */}
          <div className="mt-1.5 px-2.5 py-0.5 rounded-full bg-[#1d5e80] text-white font-sans text-[11px] font-semibold inline-flex items-center gap-1 shadow-sm">
            <span>12.21</span>
            <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
          </div>
        </div>
      </div>

      {/* Kontrol Cek Detik di Luar Objek Stiker */}
      <div className="bg-neutral-50 border-2 border-black p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleSound}
            disabled={!sourceMedia && !audioBuffer}
            className={`flex-1 py-2 px-3 disabled:opacity-40 border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
              isPlaying ? 'bg-neutral-900 text-white' : 'bg-emerald-400 hover:bg-emerald-300 text-black'
            }`}
          >
            {isPlaying ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{isPlaying ? 'Matikan Suara Stiker' : 'Putar Stiker Suara'}</span>
          </button>

          <button
            type="button"
            onClick={handleRestart}
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
            onChange={(e) => handleScrub(e.target.value)}
            className="flex-1 accent-black cursor-pointer h-2"
            aria-label="Cek detik preview stiker suara"
          />
          <span>{formatShortSec(clipDuration)}</span>
        </div>
      </div>
    </div>
  );
}
