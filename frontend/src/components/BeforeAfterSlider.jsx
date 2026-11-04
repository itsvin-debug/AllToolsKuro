import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles, Eye, MoveHorizontal } from 'lucide-react';

export default function BeforeAfterSlider({
  beforeImage,
  afterImage,
  beforeLabel = 'Sebelum (Burik / Original)',
  afterLabel = 'Sesudah (Super HD Jernih)',
  beforeDetails = '',
  afterDetails = ''
}) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const handleMove = useCallback((clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return;
    if (e.touches && e.touches[0]) {
      handleMove(e.touches[0].clientX);
    }
  }, [isDragging, handleMove]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  }, [isDragging, handleMove]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  return (
    <div className="w-full flex flex-col gap-3 select-none">
      
      {/* Label Petunjuk Interaktif */}
      <div className="flex items-center justify-between text-xs text-neutral-600 font-mono">
        <span className="flex items-center gap-1.5 font-bold text-neutral-800">
          <MoveHorizontal className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Geser garis tengah untuk melihat perbandingan</span>
        </span>
        <span className="font-bold bg-neutral-100 px-2 py-0.5 rounded border border-black text-black">
          {Math.round(sliderPosition)}% HD
        </span>
      </div>

      {/* Frame Gambar Split-Screen Sebelum vs Sesudah */}
      <div
        ref={containerRef}
        onMouseDown={(e) => {
          setIsDragging(true);
          handleMove(e.clientX);
        }}
        onTouchStart={(e) => {
          setIsDragging(true);
          if (e.touches[0]) handleMove(e.touches[0].clientX);
        }}
        className="relative w-full aspect-[4/3] sm:aspect-[16/10] max-h-[520px] rounded-2xl border-2 border-black bg-neutral-900 overflow-hidden shadow-[4px_4px_0px_#000000] cursor-ew-resize"
      >
        {/* Layer Bawah: SESUDAH (Enhanced HD) */}
        <div className="absolute inset-0 w-full h-full">
          <img
            src={afterImage}
            alt="Enhanced HD"
            className="w-full h-full object-contain pointer-events-none"
          />
          {/* Badge Kanan */}
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-black text-white font-mono text-[10px] sm:text-xs font-bold border border-white/30 shadow-md flex items-center gap-1.5 z-10">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{afterLabel}</span>
          </div>
          {afterDetails && (
            <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/80 text-emerald-400 font-mono text-[10px] font-bold border border-emerald-500/30 z-10">
              {afterDetails}
            </div>
          )}
        </div>

        {/* Layer Atas: SEBELUM (Original Burik) dengan Clip Path */}
        <div
          className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
          style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
        >
          <img
            src={beforeImage}
            alt="Original Burik"
            className="w-full h-full object-contain filter contrast-90 brightness-95"
          />
          {/* Badge Kiri */}
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-white text-black font-mono text-[10px] sm:text-xs font-bold border-2 border-black shadow-md flex items-center gap-1.5 z-10">
            <Eye className="w-3.5 h-3.5" />
            <span>{beforeLabel}</span>
          </div>
          {beforeDetails && (
            <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded bg-white/90 text-neutral-700 font-mono text-[10px] font-bold border border-black z-10">
              {beforeDetails}
            </div>
          )}
        </div>

        {/* Garis Pembatas Vertikal & Handle Geser */}
        <div
          className="absolute top-0 bottom-0 z-20 pointer-events-none"
          style={{ left: `${sliderPosition}%` }}
        >
          {/* Garis pemisah */}
          <div className="w-[3px] h-full bg-white shadow-[0_0_8px_rgba(0,0,0,0.8)] -translate-x-1/2" />

          {/* Tombol Handle Geser di Tengah */}
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white text-black border-2 border-black shadow-[2px_2px_0px_#000000] flex items-center justify-center font-bold text-xs pointer-events-auto cursor-ew-resize active:scale-95 transition-transform">
            <div className="flex items-center gap-0.5 text-black">
              <span className="text-[10px]">‹</span>
              <div className="w-[1px] h-3 bg-neutral-400" />
              <span className="text-[10px]">›</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

