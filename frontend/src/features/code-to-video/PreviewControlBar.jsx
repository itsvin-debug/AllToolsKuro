import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Rewind,
  FastForward,
  Maximize2,
  Minimize2
} from 'lucide-react';

function formatClock(sec = 0, showTenths = false) {
  const safe = Math.max(0, Number(sec) || 0);
  const mins = Math.floor(safe / 60);
  const remSec = safe % 60;
  if (showTenths) {
    const wholeSec = Math.floor(remSec);
    const tenths = Math.floor((safe - Math.floor(safe)) * 10);
    return `${String(mins).padStart(2, '0')}:${String(wholeSec).padStart(2, '0')}.${tenths}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(Math.round(remSec)).padStart(2, '0')}`;
}

/**
 * Panel Kontrol Eksternal Terpadu (Di luar kotak layar preview, identik di Mobile & Desktop)
 */
export default function PreviewControlBar({
  isPlaying,
  currentTimeSec = 0,
  durationSec = 12,
  fps = 60,
  aspectRatio = '16:9',
  virtualDims = { width: 1280, height: 720 },
  modeLabel = 'Polos',
  isFullscreen = false,
  onTogglePlay,
  onRestart,
  onSeekStart,
  onSeekChange,
  onSeekEnd,
  onJumpDelta,
  onToggleFullscreen
}) {
  const [isDragging, setIsDragging] = useState(false);

  const safeDur = Math.max(1, Number(durationSec) || 12);
  const safeCur = Math.max(0, Math.min(safeDur, Number(currentTimeSec) || 0));
  const progressPct = Math.max(0, Math.min(100, (safeCur / safeDur) * 100));

  const modeBadgeClass =
    modeLabel === '3D TV'
      ? 'bg-pink-300 text-black'
      : modeLabel === 'Kustom'
      ? 'bg-cyan-300 text-black'
      : 'bg-neutral-900 text-yellow-300';

  return (
    <div className="w-full bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-2.5 sm:p-3 space-y-2.5">
      {/* Baris 1: Timeline Durasi Interaktif (Maju-Mundur / Seekable Scrubber) */}
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="font-mono font-black text-[11px] sm:text-xs text-black tabular-nums px-1.5 py-0.5 bg-neutral-100 border border-black shrink-0">
          {formatClock(safeCur, true)}
        </span>

        <div className="relative flex-1 flex items-center min-w-0">
          {/* Tooltip posisi detik real-time saat slider digeser */}
          {isDragging && (
            <div
              style={{ left: `${progressPct}%`, transform: 'translateX(-50%)' }}
              className="absolute -top-7 px-1.5 py-0.5 bg-black text-yellow-300 border border-black font-mono font-black text-[10px] tabular-nums pointer-events-none whitespace-nowrap z-20"
            >
              {formatClock(safeCur, true)}
            </div>
          )}

          <input
            type="range"
            min={0}
            max={safeDur}
            step={0.05}
            value={safeCur}
            aria-label="Geser durasi animasi"
            onPointerDown={() => {
              setIsDragging(true);
              onSeekStart?.();
            }}
            onMouseDown={() => {
              setIsDragging(true);
              onSeekStart?.();
            }}
            onChange={(e) => {
              onSeekChange?.(Number(e.target.value));
            }}
            onPointerUp={(e) => {
              setIsDragging(false);
              onSeekEnd?.(Number(e.currentTarget.value));
            }}
            onTouchEnd={(e) => {
              setIsDragging(false);
              onSeekEnd?.(Number(e.currentTarget.value));
            }}
            onMouseUp={(e) => {
              setIsDragging(false);
              onSeekEnd?.(Number(e.currentTarget.value));
            }}
            style={{
              background: `linear-gradient(to right, #2563eb 0%, #2563eb ${progressPct}%, #e5e7eb ${progressPct}%, #e5e7eb 100%)`
            }}
            className="w-full h-3 rounded-none border border-black appearance-none cursor-pointer accent-black touch-none"
          />
        </div>

        <span className="font-mono font-bold text-[11px] sm:text-xs text-neutral-700 tabular-nums px-1.5 py-0.5 bg-neutral-100 border border-black shrink-0">
          {formatClock(safeDur, false)}
        </span>
      </div>

      {/* Baris 2: Grup Tombol Aksi & Pill Metrik (Anti-Terpotong di 360px & Desktop) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePlay}
            className={`px-2.5 py-1.5 min-h-[36px] border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-xs flex items-center gap-1 cursor-pointer transition-all ${
              isPlaying
                ? 'bg-neutral-900 hover:bg-neutral-800 text-white'
                : 'bg-emerald-400 hover:bg-emerald-300 text-black'
            }`}
            title={isPlaying ? 'Jeda (Spasi)' : 'Putar (Spasi)'}
            aria-label={isPlaying ? 'Jeda Animasi' : 'Putar Animasi'}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>Jeda</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>Putar</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="px-2 py-1.5 min-h-[36px] bg-white hover:bg-neutral-100 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-bold text-xs flex items-center gap-1 cursor-pointer transition-all"
            title="Mulai Ulang dari 00:00"
            aria-label="Mulai Ulang"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xs:inline sm:inline">Restart</span>
          </button>

          <button
            type="button"
            onClick={() => onJumpDelta?.(-2)}
            className="px-2 py-1.5 min-h-[36px] bg-neutral-100 hover:bg-neutral-200 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-mono font-black text-[11px] flex items-center gap-0.5 cursor-pointer transition-all"
            title="Mundur 2 detik"
            aria-label="Mundur 2 detik"
          >
            <Rewind className="w-3 h-3 shrink-0" />
            <span>-2s</span>
          </button>

          <button
            type="button"
            onClick={() => onJumpDelta?.(2)}
            className="px-2 py-1.5 min-h-[36px] bg-neutral-100 hover:bg-neutral-200 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-mono font-black text-[11px] flex items-center gap-0.5 cursor-pointer transition-all"
            title="Maju 2 detik"
            aria-label="Maju 2 detik"
          >
            <span>+2s</span>
            <FastForward className="w-3 h-3 shrink-0" />
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            className="px-2.5 py-1.5 min-h-[36px] bg-yellow-300 hover:bg-yellow-400 text-black border-2 border-black shadow-[1.5px_1.5px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 font-black text-xs flex items-center gap-1 cursor-pointer transition-all"
            title={isFullscreen ? 'Keluar Fullscreen (Esc)' : 'Buka Layar Penuh'}
            aria-label={isFullscreen ? 'Keluar Fullscreen' : 'Buka Fullscreen'}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 shrink-0" />
                <span>Keluar</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                <span>Fullscreen</span>
              </>
            )}
          </button>
        </div>

        {/* Grup Pill Informasi Kanan — Selalu utuh tanpa pemotongan teks */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-2 py-1 bg-emerald-100 border border-black font-mono font-black text-[10px] sm:text-[11px] text-emerald-950 whitespace-nowrap">
            FPS: {fps}
          </span>
          <span className="px-2 py-1 bg-neutral-100 border border-black font-mono font-bold text-[10px] sm:text-[11px] text-neutral-900 whitespace-nowrap">
            {aspectRatio} &bull; {virtualDims.width}&times;{virtualDims.height}
          </span>
          <span className={`px-2 py-1 border border-black font-black text-[10px] sm:text-[11px] uppercase whitespace-nowrap ${modeBadgeClass}`}>
            {modeLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
