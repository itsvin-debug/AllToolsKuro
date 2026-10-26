import React, { useEffect, useRef } from 'react';

/**
 * FallingLeavesBackground
 * Animasi kelopak bunga sakura anime berguguran lembut terbawa angin sepoi-sepoi.
 * Selalu berada di lapisan latar belakang (z-0) di balik seluruh card dan konten (z-10),
 * warna kelopak senada dengan live wallpaper wpanime.mp4, tersebar merata secara acak
 * di seluruh layar, ringan, 60 FPS, dan ramah baterai mobile.
 */
export default function FallingLeavesBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Aksesibilitas: hormati pengguna dengan prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      return;
    }

    const isMobile = width < 768;
    // Kepadatan kelopak: sedikit ramai dan merata, tidak spamming
    const petalCount = isMobile ? 24 : 42;

    // Palet warna kelopak bunga sakura otentik sesuai live wallpaper wpanime.mp4
    const sakuraPalettes = [
      { base: 'rgba(255, 240, 243, 0.92)', mid: 'rgba(255, 182, 193, 0.88)', tip: 'rgba(255, 160, 180, 0.85)' }, // Sakura pink klasik
      { base: 'rgba(255, 245, 247, 0.94)', mid: 'rgba(254, 205, 211, 0.90)', tip: 'rgba(251, 143, 168, 0.82)' }, // Blush petal lembut
      { base: 'rgba(255, 230, 238, 0.90)', mid: 'rgba(251, 143, 175, 0.85)', tip: 'rgba(244, 114, 182, 0.80)' }, // Rose petal segar
      { base: 'rgba(255, 250, 250, 0.95)', mid: 'rgba(255, 218, 225, 0.88)', tip: 'rgba(255, 182, 199, 0.82)' }, // Putih semburat pink pastel
      { base: 'rgba(255, 235, 245, 0.92)', mid: 'rgba(244, 155, 195, 0.86)', tip: 'rgba(236, 72, 153, 0.78)' }, // Aksen mekar cerah
    ];

    class SakuraPetal {
      constructor(isInitial = true) {
        this.reset(isInitial);
      }

      reset(isInitial = false) {
        // Tersebar merata di seluruh layar saat pertama kali dimuat
        if (isInitial) {
          this.x = Math.random() * width;
          this.y = Math.random() * height;
        } else {
          // Masuk secara acak dari tepi atas atau tepi kiri terbawa hembusan angin
          if (Math.random() > 0.35) {
            this.x = Math.random() * (width + 120) - 60;
            this.y = -25 - Math.random() * 30;
          } else {
            this.x = -25 - Math.random() * 20;
            this.y = Math.random() * (height * 0.75);
          }
        }

        // Ukuran proporsional kelopak bunga sakura
        this.size = 10 + Math.random() * 12;
        this.speedY = 0.85 + Math.random() * 1.15;
        this.speedX = 0.65 + Math.random() * 0.95;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.028;
        this.flip = Math.random() * Math.PI;
        this.flipSpeed = 0.016 + Math.random() * 0.024;
        this.oscillationSpeed = 0.012 + Math.random() * 0.018;
        this.oscillationOffset = Math.random() * Math.PI * 2;
        this.palette = sakuraPalettes[Math.floor(Math.random() * sakuraPalettes.length)];
      }

      update(windForce, time) {
        this.y += this.speedY;
        this.x += this.speedX + windForce + Math.sin(time * this.oscillationSpeed + this.oscillationOffset) * 0.65;
        this.rotation += this.rotationSpeed;
        this.flip += this.flipSpeed;

        // Reset saat kelopak keluar dari area bawah atau kanan layar
        if (this.y > height + 40 || this.x > width + 60) {
          this.reset(false);
        }
      }

      draw(context) {
        context.save();
        context.translate(this.x, this.y);
        context.rotate(this.rotation);

        // Efek kelopak berputar dan melayang membalik secara 3D di udara
        const scaleX = Math.cos(this.flip);
        context.scale(scaleX, 1);

        const s = this.size;

        // Gradient lembut dari pangkal (base) ke ujung kelopak (tip) khas anime
        const grad = context.createLinearGradient(0, s, 0, -s);
        grad.addColorStop(0, this.palette.base);
        grad.addColorStop(0.6, this.palette.mid);
        grad.addColorStop(1, this.palette.tip);

        context.fillStyle = grad;

        // Bentuk kelopak bunga sakura anime presisi dengan lekukan takik khas di ujung atas
        context.beginPath();
        context.moveTo(0, s); // Pangkal bawah kelopak

        // Sisi kiri melengkung anggun ke puncak cuping kiri
        context.bezierCurveTo(-s * 0.52, s * 0.62, -s * 0.66, -s * 0.12, -s * 0.44, -s * 0.82);

        // Lekukan takik mahkota sakura di tengah atas
        context.bezierCurveTo(-s * 0.22, -s * 0.95, -s * 0.08, -s * 0.72, 0, -s * 0.64);

        // Dari lekukan takik tengah ke puncak cuping kanan
        context.bezierCurveTo(s * 0.08, -s * 0.72, s * 0.22, -s * 0.95, s * 0.44, -s * 0.82);

        // Sisi kanan melengkung anggun kembali ke pangkal bawah
        context.bezierCurveTo(s * 0.66, -s * 0.12, s * 0.52, s * 0.62, 0, s);

        context.closePath();
        context.fill();

        context.restore();
      }
    }

    const petals = Array.from({ length: petalCount }, () => new SakuraPetal(true));

    let time = 0;
    let windForce = 0.75;
    let targetWindForce = 0.75;
    let lastWindChange = Date.now();

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize, { passive: true });

    let isDocumentVisible = !document.hidden;
    const handleVisibilityChange = () => {
      isDocumentVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const render = () => {
      if (!isDocumentVisible) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      time += 0.05;

      // Hembusan angin lembut yang berubah berkala
      if (Date.now() - lastWindChange > 3500) {
        targetWindForce = 0.45 + Math.random() * 1.0;
        lastWindChange = Date.now();
      }
      windForce += (targetWindForce - windForce) * 0.015;

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < petals.length; i++) {
        petals[i].update(windForce, time);
        petals[i].draw(ctx);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 opacity-85"
      style={{ willChange: 'transform' }}
    />
  );
}
