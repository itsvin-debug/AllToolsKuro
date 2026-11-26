import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
  MessageSquare,
  CheckCircle2
} from 'lucide-react';
import KuroCharacter from './KuroCharacter';
import { cleanSpeechText } from './kurobotCatalog';

function rectsOverlap(a, b, pad = 10) {
  if (!a || !b) return false;
  return !(
    a.right + pad < b.left ||
    a.left - pad > b.right ||
    a.bottom + pad < b.top ||
    a.top - pad > b.bottom
  );
}

function overlapArea(a, b) {
  if (!a || !b) return 0;
  const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return xOverlap * yOverlap;
}

/**
 * Overlay Spotlight & Kartu Tur Interaktif Ringkas (Non-blocking Desktop & Mobile)
 */
export default function TourSpotlightOverlay({
  tool,
  stepIndex,
  totalSteps,
  onPrev,
  onNext,
  onFinish,
  onOpenChat,
  onOpenTool
}) {
  const cardRef = useRef(null);
  const [targetRect, setTargetRect] = useState(null);
  const [placement, setPlacement] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'bottom' : 'right-bottom'
  );

  const measureAndPlace = useCallback(() => {
    if (typeof window === 'undefined' || !tool?.id) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < 768;

    const el = document.getElementById(`tool-${tool.id}`);
    if (!el) {
      setTargetRect(null);
      setPlacement(isMobile ? 'bottom' : 'right-bottom');
      return;
    }

    const r = el.getBoundingClientRect();
    const visibleTarget = r.width > 0 && r.height > 0 ? {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height
    } : null;

    setTargetRect(visibleTarget);

    if (!visibleTarget) {
      setPlacement(isMobile ? 'bottom' : 'right-bottom');
      return;
    }

    const cardRect = cardRef.current?.getBoundingClientRect();
    const cardW = cardRect?.width || (isMobile ? vw - 24 : 350);
    const cardH = cardRect?.height || (isMobile ? Math.min(250, Math.round(vh * 0.32)) : 240);

    if (isMobile) {
      const bottomBox = {
        left: 12,
        right: vw - 12,
        top: vh - 76 - cardH,
        bottom: vh - 76
      };
      const topBox = {
        left: 12,
        right: vw - 12,
        top: 68,
        bottom: 68 + cardH
      };

      const bottomOverlap = overlapArea(visibleTarget, bottomBox);
      if (bottomOverlap <= 0) {
        setPlacement('bottom');
      } else {
        const topOverlap = overlapArea(visibleTarget, topBox);
        setPlacement(topOverlap < bottomOverlap ? 'top' : 'bottom');
      }
      return;
    }

    const targetCenterX = visibleTarget.left + visibleTarget.width * 0.5;
    const rightBottomBox = {
      left: vw - 20 - cardW,
      right: vw - 20,
      top: vh - 20 - cardH,
      bottom: vh - 20
    };
    const leftBottomBox = {
      left: 20,
      right: 20 + cardW,
      top: vh - 20 - cardH,
      bottom: vh - 20
    };
    const topRightBox = {
      left: vw - 20 - cardW,
      right: vw - 20,
      top: 80,
      bottom: 80 + cardH
    };

    const preferredOrder = targetCenterX < vw * 0.5
      ? [
          { id: 'right-bottom', box: rightBottomBox },
          { id: 'left-bottom', box: leftBottomBox },
          { id: 'top-right', box: topRightBox }
        ]
      : [
          { id: 'left-bottom', box: leftBottomBox },
          { id: 'right-bottom', box: rightBottomBox },
          { id: 'top-right', box: topRightBox }
        ];

    const freeSpot = preferredOrder.find((cand) => !rectsOverlap(visibleTarget, cand.box, 12));
    if (freeSpot) {
      setPlacement(freeSpot.id);
    } else {
      preferredOrder.sort((a, b) => overlapArea(visibleTarget, a.box) - overlapArea(visibleTarget, b.box));
      setPlacement(preferredOrder[0].id);
    }
  }, [tool?.id]);

  // Smooth scroll cerdas ke kartu target lalu hitung ulang posisi setelah ~350ms
  useEffect(() => {
    if (typeof window === 'undefined' || !tool?.id) return undefined;

    let retryTimer = null;
    let settleTimer = null;
    let rafId = 0;

    const scrollToTarget = () => {
      const el = document.getElementById(`tool-${tool.id}`);
      if (!el) return false;

      if (window.innerWidth < 768) {
        const rect = el.getBoundingClientRect();
        const absTop = rect.top + window.scrollY;
        const idealTop = Math.max(0, absTop - window.innerHeight * 0.22);
        window.scrollTo({ top: idealTop, behavior: 'smooth' });
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }

      rafId = requestAnimationFrame(measureAndPlace);
      settleTimer = setTimeout(measureAndPlace, 360);
      return true;
    };

    if (!scrollToTarget()) {
      retryTimer = setTimeout(scrollToTarget, 220);
    }

    const onViewportChange = () => measureAndPlace();
    window.addEventListener('scroll', onViewportChange, { passive: true });
    window.addEventListener('resize', onViewportChange);

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (settleTimer) clearTimeout(settleTimer);
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onViewportChange);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [tool?.id, stepIndex, measureAndPlace]);

  if (!tool) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const isLastStep = stepIndex >= totalSteps - 1;

  // Hitung koordinat badge panah kecil di luar kartu target
  let badgeStyle = null;
  let badgePointsDown = true;
  if (targetRect && typeof window !== 'undefined') {
    const placeAbove = targetRect.top > 96;
    badgePointsDown = placeAbove;
    const centerX = Math.max(92, Math.min(window.innerWidth - 92, targetRect.left + targetRect.width * 0.5));
    const badgeTop = placeAbove
      ? Math.max(58, targetRect.top - 34)
      : Math.min(window.innerHeight - 108, targetRect.bottom + 8);
    badgeStyle = {
      left: `${Math.round(centerX)}px`,
      top: `${Math.round(badgeTop)}px`,
      transform: 'translateX(-50%)'
    };
  }

  let cardPositionClass = '';
  if (isMobile) {
    cardPositionClass = placement === 'top'
      ? 'fixed top-[68px] left-3 right-3 mx-auto w-[calc(100vw-24px)] max-h-[32vh]'
      : 'fixed bottom-[76px] left-3 right-3 mx-auto w-[calc(100vw-24px)] max-h-[32vh]';
  } else if (placement === 'left-bottom') {
    cardPositionClass = 'fixed bottom-5 left-5 w-[350px] max-h-[280px]';
  } else if (placement === 'top-right') {
    cardPositionClass = 'fixed top-20 right-5 w-[350px] max-h-[280px]';
  } else {
    cardPositionClass = 'fixed bottom-5 right-5 w-[350px] max-h-[280px]';
  }

  return (
    <>
      {/* 1. Ring Highlight Non-Blocking di Sekitar Kartu Target */}
      {targetRect && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: `${Math.max(2, Math.round(targetRect.left - 4))}px`,
            top: `${Math.max(2, Math.round(targetRect.top - 4))}px`,
            width: `${Math.round(targetRect.width + 8)}px`,
            height: `${Math.round(targetRect.height + 8)}px`,
            zIndex: 40,
            pointerEvents: 'none'
          }}
          className="rounded-2xl border-[3px] border-blue-600 ring-4 ring-yellow-300/90 shadow-[0_0_24px_rgba(37,99,235,0.35)] transition-all duration-200"
        />
      )}

      {/* 2. Badge Panah Arah Ringkas di Luar Kartu Target */}
      {badgeStyle && (
        <div
          aria-hidden="true"
          style={{ ...badgeStyle, position: 'fixed', zIndex: 45, pointerEvents: 'none' }}
          className="px-2.5 py-1 rounded-full bg-yellow-300 text-black border-2 border-black shadow-[2px_2px_0px_#000] font-black text-[10px] font-mono flex items-center gap-1 whitespace-nowrap"
        >
          {badgePointsDown ? (
            <ArrowDown className="w-3 h-3 stroke-[3] text-blue-700" />
          ) : (
            <ArrowUp className="w-3 h-3 stroke-[3] text-blue-700" />
          )}
          <span>Fitur {stepIndex + 1}/{totalSteps}</span>
        </div>
      )}

      {/* 3. Kartu Tur Spotlight Ringkas */}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={`Tur Fitur ${tool.name}`}
        className={`${cardPositionClass} z-50 rounded-2xl border-2 border-black bg-white text-black shadow-[5px_5px_0px_#000000] flex flex-col overflow-hidden`}
      >
        {/* Header Ringkas */}
        <div className="px-3 py-2 bg-neutral-50 border-b-2 border-black flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600 border-2 border-black overflow-hidden shrink-0 flex items-center justify-center p-0.5 shadow-[1.5px_1.5px_0px_#000]">
              <KuroCharacter state="wave" size={24} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-yellow-300 border border-black font-mono font-black text-[10px] shrink-0">
                  {stepIndex + 1} / {totalSteps}
                </span>
                <span className="font-black text-xs text-black truncate">{tool.name}</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-blue-700 block truncate">
                [{tool.tag}]
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onOpenChat}
              className="px-2 py-1 rounded-lg bg-white hover:bg-neutral-100 text-black border border-black font-bold text-[10px] shadow-[1.5px_1.5px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1 cursor-pointer"
              title="Kembali ke jendela chat lengkap"
            >
              <MessageSquare className="w-3 h-3" />
              <span className="hidden xs:inline">Buka Chat</span>
            </button>
            <button
              type="button"
              onClick={onFinish}
              className="w-6 h-6 rounded-lg bg-white hover:bg-rose-50 text-black border border-black shadow-[1.5px_1.5px_0px_#000] flex items-center justify-center cursor-pointer"
              title="Selesai Tur"
              aria-label="Selesai Tur"
            >
              <X className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Deskripsi & Cara Pakai Ringkas */}
        <div className="px-3 py-2 overflow-y-auto flex-1 space-y-1 text-[11px] sm:text-xs leading-snug custom-scrollbar">
          <p className="text-neutral-900 font-semibold">{cleanSpeechText(tool.desc)}</p>
          <p className="text-neutral-700 font-medium">
            <span className="font-black text-black">Cara pakai:</span> {cleanSpeechText(tool.howToUse)}
          </p>
        </div>

        {/* Tombol Navigasi Tur */}
        <div className="px-3 py-2 bg-neutral-50 border-t-2 border-black flex items-center justify-between gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onPrev}
            disabled={stepIndex <= 0}
            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-neutral-100 disabled:opacity-40 text-black font-bold text-[11px] border border-black shadow-[1.5px_1.5px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Sebelumnya</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenTool?.(tool.id)}
            className="px-2.5 py-1.5 rounded-lg bg-yellow-300 hover:bg-yellow-400 text-black font-black text-[11px] border border-black shadow-[1.5px_1.5px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1 cursor-pointer"
          >
            <span>Buka Fitur</span>
            <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>

          {!isLastStep ? (
            <button
              type="button"
              onClick={onNext}
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-black text-[11px] border border-black shadow-[1.5px_1.5px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1 cursor-pointer"
            >
              <span>Lanjut</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onFinish}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] border border-black shadow-[1.5px_1.5px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1 cursor-pointer"
            >
              <span>Selesai Tur</span>
              <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
