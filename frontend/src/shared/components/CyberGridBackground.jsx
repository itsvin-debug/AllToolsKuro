import React, { useEffect, useRef } from 'react';

/**
 * CyberGridBackground
 * Efek visual latar belakang Cyber Grid retro-futuristik Neobrutalisme.
 * Menghadirkan grid geometris bergaris tegas dengan aksen perspektif dan node silang (crosshairs),
 * berjalan mulus 60 FPS di lapisan z-0 tanpa mengganggu keterbacaan teks atau kartu antarmuka.
 */
export default function CyberGridBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Hormati preferensi pengguna untuk reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const isDarkMode = () => document.documentElement.classList.contains('dark');

    let offset = 0;
    const gridSize = 40; // Ukuran kotak grid dalam piksel

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const dark = isDarkMode();
      const lineColor = dark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)';
      const accentLineColor = dark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.15)';
      const nodeColor = dark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.3)';

      if (!prefersReducedMotion) {
        offset = (offset + 0.35) % gridSize;
      }

      ctx.lineWidth = 1;

      // Garis vertikal
      for (let x = 0; x <= width + gridSize; x += gridSize) {
        ctx.strokeStyle = (Math.floor(x / gridSize) % 5 === 0) ? accentLineColor : lineColor;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Garis horizontal bergerak perlahan
      for (let y = offset; y <= height + gridSize; y += gridSize) {
        ctx.strokeStyle = (Math.floor(y / gridSize) % 5 === 0) ? accentLineColor : lineColor;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        // Crosshair node kecil di titik potong tiap beberapa interval
        for (let x = 0; x <= width + gridSize; x += gridSize * 2) {
          if (Math.floor(y / gridSize) % 2 === 0) {
            ctx.fillStyle = nodeColor;
            ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
          }
        }
      }

      if (!prefersReducedMotion) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    />
  );
}
