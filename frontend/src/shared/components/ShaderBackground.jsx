import React, { useEffect, useRef } from 'react';

// Outer Space Background dengan Bintang Berkelap-kelip & Animasi Komet/Bintang Jatuh Sinematik
export default function ShaderBackground({ theme = 'dark' }) {
  const canvasRef = useRef(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // 1. Data Bintang-bintang Luar Angkasa
    const starCount = 180;
    let stars = [];

    // 2. Data Komet / Bintang Jatuh
    let comets = [];
    let lastCometSpawn = Date.now();
    let nextCometDelay = 2500 + Math.random() * 3000; // interval acak 2.5 - 5.5 detik

    const initStars = (w, h) => {
      stars = [];
      for (let i = 0; i < starCount; i++) {
        const layer = Math.random();
        let radius, baseAlpha, color, hasGlow;

        if (layer < 0.65) {
          // Bintang jauh (titik halus redup)
          radius = 0.5 + Math.random() * 0.7;
          baseAlpha = 0.2 + Math.random() * 0.45;
          color = isDark ? '#c7d2fe' : '#64748b';
          hasGlow = false;
        } else if (layer < 0.90) {
          // Bintang sedang
          radius = 1.0 + Math.random() * 0.8;
          baseAlpha = 0.45 + Math.random() * 0.45;
          color = isDark ? (Math.random() > 0.5 ? '#e0e7ff' : '#38bdf8') : '#475569';
          hasGlow = false;
        } else {
          // Bintang terang utama dengan kilauan
          radius = 1.6 + Math.random() * 0.8;
          baseAlpha = 0.7 + Math.random() * 0.3;
          color = isDark ? (Math.random() > 0.4 ? '#ffffff' : '#a5b4fc') : '#334155';
          hasGlow = isDark;
        }

        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius,
          baseAlpha,
          color,
          hasGlow,
          twinkleSpeed: 0.0015 + Math.random() * 0.0035,
          phase: Math.random() * Math.PI * 2
        });
      }
    };

    const spawnComet = (w, h) => {
      // Sudut diagonal jatuh yang elegan (sekitar 35 - 45 derajat ke arah kiri bawah)
      const angle = (Math.PI * 0.75) + (Math.random() * 0.15 - 0.075);
      const speed = 12 + Math.random() * 8;
      const length = 90 + Math.random() * 80;

      // Posisi awal acak dari atas atau kanan atas
      const startX = w * 0.1 + Math.random() * (w * 1.1);
      const startY = -40 + Math.random() * (h * 0.35);

      comets.push({
        x: startX,
        y: startY,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        length,
        speed,
        life: 0,
        maxLife: 80 + Math.random() * 40,
        opacity: 0,
        targetOpacity: 0.85 + Math.random() * 0.15,
        color: Math.random() > 0.4 ? '#38bdf8' : '#a855f7' // Cyan atau cosmic violet
      });
    };

    const handleResize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);
      initStars(width, height);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Animasi loop 60fps dengan manajemen frame efisien
    let isVisible = true;
    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const render = (timestamp) => {
      if (!isVisible) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // 1. Gambar Bintang-Bintang dengan Twinkle Halus
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        const alphaDelta = Math.sin(timestamp * star.twinkleSpeed + star.phase) * 0.35;
        const currentAlpha = Math.max(0.1, Math.min(1, star.baseAlpha + alphaDelta));

        ctx.save();
        ctx.globalAlpha = currentAlpha;
        ctx.fillStyle = star.color;

        if (star.hasGlow) {
          ctx.shadowBlur = 6;
          ctx.shadowColor = star.color;
        }

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 2. Spawn Komet Baru jika sudah saatnya
      const now = Date.now();
      if (now - lastCometSpawn > nextCometDelay) {
        spawnComet(width, height);
        lastCometSpawn = now;
        nextCometDelay = 3000 + Math.random() * 4500;
      }

      // 3. Render & Update Komet Jatuh
      for (let i = comets.length - 1; i >= 0; i--) {
        const comet = comets[i];
        comet.life++;

        // Update posisi
        comet.x += comet.dx;
        comet.y += comet.dy;

        // Fade in di awal, fade out di akhir
        if (comet.life < 15) {
          comet.opacity = (comet.life / 15) * comet.targetOpacity;
        } else if (comet.life > comet.maxLife - 25) {
          comet.opacity = Math.max(0, ((comet.maxLife - comet.life) / 25) * comet.targetOpacity);
        } else {
          comet.opacity = comet.targetOpacity;
        }

        // Hitung ekor komet ke belakang
        const tailX = comet.x - (comet.dx / comet.speed) * comet.length;
        const tailY = comet.y - (comet.dy / comet.speed) * comet.length;

        // Gradien cahaya ekor komet
        const grad = ctx.createLinearGradient(tailX, tailY, comet.x, comet.y);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        grad.addColorStop(0.5, comet.color === '#38bdf8' 
          ? (isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(56, 189, 248, 0.15)') 
          : (isDark ? 'rgba(168, 85, 247, 0.25)' : 'rgba(168, 85, 247, 0.15)')
        );
        grad.addColorStop(0.85, isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(15, 23, 42, 0.5)');
        grad.addColorStop(1, isDark ? '#ffffff' : '#0f172a');

        ctx.save();
        ctx.globalAlpha = comet.opacity;

        // Garis ekor komet
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(comet.x, comet.y);
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = grad;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Kepala komet yang bercahaya
        ctx.shadowBlur = 8;
        ctx.shadowColor = comet.color;
        ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
        ctx.beginPath();
        ctx.arc(comet.x, comet.y, 1.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Hapus jika sudah selesai atau keluar layar
        if (comet.life >= comet.maxLife || comet.y > height + 100 || comet.x < -100) {
          comets.splice(i, 1);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDark]);

  return (
    <div 
      className={`fixed inset-0 z-0 pointer-events-none overflow-hidden transition-colors duration-700 ${
        isDark ? 'bg-[#030408]' : 'bg-[#f1f5f9]'
      }`}
    >
      {/* 1. Deep Space Nebula Glow Layers (Menyesuaikan dengan Lubang Hitam) */}
      <div 
        className={`absolute top-[-10%] left-1/2 -translate-x-1/2 w-[900px] h-[650px] rounded-full blur-[150px] pointer-events-none transition-all duration-700 ${
          isDark ? 'opacity-35' : 'opacity-25'
        }`}
        style={{
          background: isDark
            ? 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.45) 0%, rgba(147, 51, 234, 0.25) 45%, rgba(6, 182, 212, 0.12) 70%, transparent 85%)'
            : 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.2) 0%, rgba(56, 189, 248, 0.15) 50%, transparent 80%)'
        }}
      />

      {/* 2. Gravitational Accretion Nebula Ambient (Sisi Bawah Kosmik) */}
      <div 
        className={`absolute bottom-[-15%] right-[-5%] w-[700px] h-[700px] rounded-full blur-[160px] pointer-events-none transition-all duration-700 ${
          isDark ? 'opacity-25' : 'opacity-15'
        }`}
        style={{
          background: isDark
            ? 'radial-gradient(circle, rgba(168, 85, 247, 0.35) 0%, rgba(59, 130, 246, 0.15) 50%, transparent 75%)'
            : 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)'
        }}
      />

      {/* 3. Outer Left Cosmic Dust */}
      <div 
        className={`absolute top-[40%] left-[-10%] w-[550px] h-[550px] rounded-full blur-[170px] pointer-events-none transition-all duration-700 ${
          isDark ? 'opacity-20' : 'opacity-10'
        }`}
        style={{
          background: isDark
            ? 'radial-gradient(circle, rgba(6, 182, 212, 0.3) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, transparent 70%)'
        }}
      />

      {/* 4. Canvas Interaktif: Bintang-bintang Berkelap-kelip & Animasi Komet Jatuh */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* 5. Deep Space Vignette Masking (Memastikan Kontras Konten Tetap Jernih) */}
      <div 
        className={`absolute inset-0 pointer-events-none transition-colors duration-700 ${
          isDark 
            ? 'bg-gradient-to-b from-transparent via-[#030408]/30 to-[#030408]/90' 
            : 'bg-gradient-to-b from-transparent via-slate-100/30 to-[#f1f5f9]'
        }`} 
      />
    </div>
  );
}
