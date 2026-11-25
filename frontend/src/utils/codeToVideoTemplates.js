/**
 * Kuro Studio - Code to Video Templates (True Full-Screen Cinematic)
 * Kumpulan template animasi visual siap pakai (Hybrid HTML/CSS/JS, Pure Canvas, GLSL Shader, Ads)
 * untuk Code to Video Studio.
 */

export const CODE_TEMPLATES = [
  {
    id: 'promo-ad',
    name: 'Iklan Promo Produk Sinematik',
    category: 'hybrid',
    badge: 'HYBRID / AD',
    description: 'Animasi iklan promo modern 100% full-bleed dengan glow dinamis, headline sinematik, badge diskon, dan CTA beranimasi.',
    defaults: {
      stage3d: false, // Default: OFF (Full Layar Sinematik Murni)
      vignette: true,
      colorBoost: false,
      bgType: 'gradient',
      bgColor1: '#0a0a14',
      bgColor2: '#160b28',
      rotateX: 18,
      rotateY: -20,
      rotateZ: 0,
      zoom: 1.05,
      autoOrbit: false,
      motionSpeed: 1.0,
      clouds: false,
      cloudDensity: 0.25,
      cloudColor: '#1d0f38',
      particles: false,
      particleStyle: 'dust',
      particleCount: 80,
      particleColor: '#00f0ff',
      hudEnabled: false,
      hudTitle: 'SPECIAL LAUNCH',
      hudSubtitle: 'LIMITED EDITION COLLECTION',
      hudPosition: 'bottom-left'
    },
    html: `<div class="ad-container">
  <canvas id="ad-canvas"></canvas>
</div>`,
    css: `* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #080711;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.ad-container {
  width: 100vw;
  height: 100vh;
  position: relative;
}
#ad-canvas {
  width: 100%;
  height: 100%;
  display: block;
}`,
    js: `const canvas = document.getElementById('ad-canvas') || document.querySelector('canvas');
if (canvas) {
  const ctx = canvas.getContext('2d');
  function resize() {
    canvas.width = window.innerWidth || 1280;
    canvas.height = window.innerHeight || 720;
  }
  resize();
  window.addEventListener('resize', resize);

  // Inisialisasi Partikel Cyber
  const particles = [];
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * 1920,
      y: Math.random() * 1080,
      r: Math.random() * 3 + 1,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      color: Math.random() > 0.5 ? '#00f0ff' : '#ff007f'
    });
  }

  function loop(now) {
    const t = (now || performance.now()) * 0.001;
    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.min(w / 1280, h / 720);

    // 1. Latar Belakang Gradien Ruang Angkasa
    const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    bgGrad.addColorStop(0, '#150f28');
    bgGrad.addColorStop(0.6, '#080712');
    bgGrad.addColorStop(1, '#040308');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Partikel Ambien
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8 * scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 3. Kartu Promo Sinematik di Tengah
    const cardW = Math.min(w * 0.88, 540 * scale);
    const cardH = Math.min(h * 0.88, 440 * scale);
    const cardX = (w - cardW) / 2;
    const cardY = (h - cardH) / 2;

    ctx.save();
    // Bayangan Kartu
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(cardX + 8 * scale, cardY + 8 * scale, cardW, cardH);

    // Kotak Kaca Kartu
    ctx.fillStyle = 'rgba(14, 12, 28, 0.86)';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.lineWidth = 2 * scale;
    ctx.strokeRect(cardX, cardY, cardW, cardH);

    // Garis Aksen Atas Neon
    const lineGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
    lineGrad.addColorStop(0, '#00f0ff');
    lineGrad.addColorStop(0.5, '#ff007f');
    lineGrad.addColorStop(1, '#00f0ff');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 3.5 * scale;
    ctx.beginPath();
    ctx.moveTo(cardX, cardY);
    ctx.lineTo(cardX + cardW, cardY);
    ctx.stroke();

    const cx = w * 0.5;

    // Badge Pill
    const badgeY = cardY + 48 * scale;
    ctx.font = \`900 \${11 * scale}px monospace\`;
    ctx.textAlign = 'center';
    const badgeText = 'LIMITED TIME • 50% OFF';
    const badgeWidth = ctx.measureText(badgeText).width + 28 * scale;
    const badgeHeight = 26 * scale;

    ctx.fillStyle = 'rgba(255, 0, 127, 0.2)';
    ctx.fillRect(cx - badgeWidth / 2, badgeY - 18 * scale, badgeWidth, badgeHeight);
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeRect(cx - badgeWidth / 2, badgeY - 18 * scale, badgeWidth, badgeHeight);

    ctx.fillStyle = '#ff007f';
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 8 * scale;
    ctx.fillText(badgeText, cx, badgeY);

    // Judul Utama (CYBER DROP X-01)
    const titleY = badgeY + 68 * scale;
    ctx.font = \`900 \${40 * scale}px sans-serif\`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10 * scale;
    ctx.fillText('CYBER DROP', cx, titleY);

    // X-01 Highlight Neon
    const subTitleY = titleY + 42 * scale;
    ctx.font = \`900 \${36 * scale}px sans-serif\`;
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 18 * scale;
    ctx.fillText('EDITION X-01', cx, subTitleY);

    // Deskripsi Produk
    ctx.shadowBlur = 0;
    const descY = subTitleY + 36 * scale;
    ctx.font = \`500 \${13 * scale}px sans-serif\`;
    ctx.fillStyle = '#a8a8c8';
    ctx.fillText('Sneaker Futuristik dengan Bantalan Ionik Quantum', cx, descY);

    // Baris Harga
    const priceY = descY + 54 * scale;
    ctx.font = \`700 \${16 * scale}px monospace\`;
    ctx.fillStyle = '#777777';
    ctx.fillText('$299.00', cx - 55 * scale, priceY);

    // Coretan Harga Lama
    const oldPriceWidth = ctx.measureText('$299.00').width;
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(cx - 55 * scale - oldPriceWidth / 2, priceY - 5 * scale);
    ctx.lineTo(cx - 55 * scale + oldPriceWidth / 2, priceY - 5 * scale);
    ctx.stroke();

    // Harga Baru
    ctx.font = \`900 \${34 * scale}px monospace\`;
    ctx.fillStyle = '#00ff88';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 16 * scale;
    ctx.fillText('$149.00', cx + 55 * scale, priceY + 2 * scale);

    // Tombol CTA (DAPATKAN SEKARANG)
    const btnY = priceY + 54 * scale;
    const btnW = 240 * scale;
    const btnH = 46 * scale;
    const btnPulse = Math.sin(t * 4) * 0.15 + 0.85;

    ctx.save();
    ctx.translate(cx, btnY);
    ctx.fillStyle = '#000000';
    ctx.fillRect(-btnW / 2 + 3 * scale, -btnH / 2 + 3 * scale, btnW, btnH);

    const btnGrad = ctx.createLinearGradient(-btnW / 2, 0, btnW / 2, 0);
    btnGrad.addColorStop(0, '#00f0ff');
    btnGrad.addColorStop(1, '#7928ca');
    ctx.fillStyle = btnGrad;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = (15 * btnPulse) * scale;
    ctx.fillRect(-btnW / 2, -btnH / 2, btnW, btnH);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeRect(-btnW / 2, -btnH / 2, btnW, btnH);

    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 0;
    ctx.font = \`900 \${13 * scale}px sans-serif\`;
    ctx.fillText('DAPATKAN SEKARANG', 0, 5 * scale);
    ctx.restore();

    ctx.restore();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}`
  },
  {
    id: 'astral-wave',
    name: 'Astral Wave & Hexa Orbit',
    category: 'hybrid',
    badge: 'CANVAS 2D / 3D',
    description: 'Gelombang sinus neon multi-layer dengan cincin orbit heksagonal dan interferensi frekuensi tinggi.',
    defaults: {
      stage3d: false, // Default: OFF (Full Layar Sinematik)
      vignette: true,
      colorBoost: true,
      bgType: 'gradient',
      bgColor1: '#070714',
      bgColor2: '#16092b',
      rotateX: 18,
      rotateY: -22,
      rotateZ: 0,
      zoom: 1.05,
      autoOrbit: true,
      motionSpeed: 1.0,
      clouds: false,
      cloudDensity: 0.35,
      cloudColor: '#211042',
      particles: true,
      particleStyle: 'sparks',
      particleCount: 120,
      particleColor: '#00f0ff',
      hudEnabled: false,
      hudTitle: 'ASTRAL FREQUENCY',
      hudSubtitle: 'HEXA ORBIT MATRIX v2.0',
      hudPosition: 'bottom-left'
    },
    html: `<canvas id="canvas"></canvas>`,
    css: `* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; background: #070714; overflow: hidden; }
#canvas { width: 100%; height: 100%; display: block; }`,
    js: `const canvas = document.getElementById('canvas') || document.querySelector('canvas');
if (canvas) {
  const ctx = canvas.getContext('2d');
  function resize() {
    canvas.width = window.innerWidth || 1280;
    canvas.height = window.innerHeight || 720;
  }
  resize();
  window.addEventListener('resize', resize);

  function render(time) {
    const t = (time || performance.now()) * 0.001;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = 'rgba(7, 7, 20, 0.25)';
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.5;

    // Heksagon Utama Berputar
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.4);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * (Math.min(w, h) * 0.22);
      const y = Math.sin(angle) * (Math.min(w, h) * 0.22);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // Heksagon Kedua Berlawanan
    ctx.rotate(-t * 0.8);
    ctx.strokeStyle = '#ff007f';
    ctx.shadowColor = '#ff007f';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * (Math.min(w, h) * 0.13);
      const y = Math.sin(angle) * (Math.min(w, h) * 0.13);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Gelombang Sinus Neon di Garis Horizontal
    const waveCount = 3;
    const colors = ['#00f0ff', '#ff007f', '#00ff88'];
    for (let j = 0; j < waveCount; j++) {
      ctx.save();
      ctx.strokeStyle = colors[j];
      ctx.shadowColor = colors[j];
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = cy + Math.sin(x * 0.012 + t * 2.5 + j * 1.2) * (45 + j * 16);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}`
  },
  {
    id: 'spectrum-pulse',
    name: 'Spectrum Pulse Ring',
    category: 'canvas',
    badge: 'PURE JS CANVAS',
    description: 'Cincin spektrum audio reaktif dengan radiasi bar warna-warni, gelombang riak, dan orb tengah.',
    defaults: {
      stage3d: false, // Default: OFF (Full Layar Sinematik)
      vignette: true,
      colorBoost: true,
      bgType: 'gradient',
      bgColor1: '#05020d',
      bgColor2: '#120524',
      rotateX: 24,
      rotateY: -16,
      rotateZ: 0,
      zoom: 1.05,
      autoOrbit: true,
      motionSpeed: 1.0,
      clouds: false,
      cloudDensity: 0.3,
      cloudColor: '#2b0c4f',
      particles: true,
      particleStyle: 'stars',
      particleCount: 150,
      particleColor: '#ff007f',
      hudEnabled: false,
      hudTitle: 'SPECTRUM PULSE',
      hudSubtitle: 'REACTIVE AUDIO EQUALIZER',
      hudPosition: 'top-left'
    },
    code: `// --- SPECTRUM PULSE RING ---
// Didukung variabel bawaan: ctx, canvas, width, height, time, dt, frame, t

ctx.fillStyle = 'rgba(5, 2, 13, 0.22)';
ctx.fillRect(0, 0, width, height);

const cx = width * 0.5;
const cy = height * 0.5;
const baseRadius = Math.min(width, height) * 0.16;
const numBars = 64;

// Gambar Cahaya Inti Pusat (Central Core Glow)
const coreGlow = ctx.createRadialGradient(cx, cy, 10, cx, cy, baseRadius * 0.85);
coreGlow.addColorStop(0, '#ffffff');
coreGlow.addColorStop(0.3, '#ff007f');
coreGlow.addColorStop(0.7, '#7928ca');
coreGlow.addColorStop(1, 'transparent');
ctx.fillStyle = coreGlow;
ctx.beginPath();
ctx.arc(cx, cy, baseRadius * 0.85, 0, Math.PI * 2);
ctx.fill();

// Gambar Inti Berdenyut
const pulse = baseRadius * 0.16 + Math.sin(time * 6) * 4;
ctx.fillStyle = '#ffffff';
ctx.shadowColor = '#00f0ff';
ctx.shadowBlur = 20;
ctx.beginPath();
ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
ctx.fill();

// Render Bar Spektrum Melingkar
for (let i = 0; i < numBars; i++) {
  const angle = (i / numBars) * Math.PI * 2 + time * 0.2;
  const freq = Math.sin(i * 0.4 + time * 4) * Math.cos(i * 0.2 - time * 2);
  const barHeight = 20 + Math.abs(freq) * (baseRadius * 0.75) + Math.sin(time * 8 + i) * 12;

  const x1 = cx + Math.cos(angle) * baseRadius;
  const y1 = cy + Math.sin(angle) * baseRadius;
  const x2 = cx + Math.cos(angle) * (baseRadius + barHeight);
  const y2 = cy + Math.sin(angle) * (baseRadius + barHeight);

  const hue = (i / numBars) * 360 + (time * 50) % 360;
  ctx.save();
  ctx.strokeStyle = \`hsl(\${hue}, 100%, 60%)\`;
  ctx.shadowColor = \`hsl(\${hue}, 100%, 60%)\`;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// Cincin Riak Gelombang Luar
for (let r = 1; r <= 2; r++) {
  const rippleRadius = (baseRadius * 1.5 + (time * 70 * r) % (baseRadius * 1.8));
  const alpha = Math.max(0, 1 - (rippleRadius - baseRadius) / (baseRadius * 1.8));
  ctx.save();
  ctx.strokeStyle = \`rgba(0, 240, 255, \${alpha * 0.4})\`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}`
  },
  {
    id: 'kinetic-ad',
    name: 'Kinetic Ad Typography',
    category: 'hybrid',
    badge: 'KINETIC / REEL (9:16 / 16:9)',
    description: 'Animasi tipografi kinetik bertenaga tinggi bergaya agensi modern dengan aksen neon berdenyut untuk TikTok, Reels, dan Shorts.',
    defaults: {
      stage3d: false, // Default: OFF (Full Layar Sinematik)
      vignette: true,
      colorBoost: true,
      bgType: 'solid',
      bgColor1: '#000000',
      bgColor2: '#000000',
      rotateX: 0,
      rotateY: 0,
      rotateZ: 0,
      zoom: 1.0,
      autoOrbit: false,
      motionSpeed: 1.0,
      clouds: false,
      cloudDensity: 0.1,
      cloudColor: '#111',
      particles: false,
      particleStyle: 'sparks',
      particleCount: 50,
      particleColor: '#ff0055',
      hudEnabled: false,
      hudTitle: 'KINETIC REEL',
      hudSubtitle: 'VERTICAL MOTION POSTER',
      hudPosition: 'bottom-center'
    },
    html: `<canvas id="kinetic-canvas"></canvas>`,
    css: `* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
  font-family: Impact, "Arial Black", -apple-system, sans-serif;
}
#kinetic-canvas {
  width: 100%;
  height: 100%;
  display: block;
}`,
    js: `const canvas = document.getElementById('kinetic-canvas') || document.querySelector('canvas');
if (canvas) {
  const ctx = canvas.getContext('2d');
  function resize() {
    canvas.width = window.innerWidth || 1280;
    canvas.height = window.innerHeight || 720;
  }
  resize();
  window.addEventListener('resize', resize);

  function loop(now) {
    const t = (now || performance.now()) * 0.001;
    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.min(w / 720, h / 1080) > 0.5 ? Math.min(w / 720, h / 1080) : Math.min(w / 1280, h / 720) * 1.2;

    // 1. Background Radial Hitam Pekat
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.5, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
    bg.addColorStop(0, '#1a1a1a');
    bg.addColorStop(1, '#050505');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // 2. Garis Aksen Kecepatan di Latar Belakang
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1.5 * scale;
    for (let i = 0; i < 8; i++) {
      const y = ((t * 80 + i * (h / 8)) % h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Bingkai Neobrutalist Luar
    const pad = 24 * scale;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4 * scale;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

    // Sudut Crosshair
    const crossSize = 12 * scale;
    ctx.lineWidth = 2 * scale;
    [[pad, pad], [w - pad, pad], [pad, h - pad], [w - pad, h - pad]].forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.moveTo(cx - crossSize, cy); ctx.lineTo(cx + crossSize, cy);
      ctx.moveTo(cx, cy - crossSize); ctx.lineTo(cx, cy + crossSize);
      ctx.stroke();
    });

    // 4. Header Monospace Atas
    const topY = pad + 38 * scale;
    ctx.font = \`900 \${13 * scale}px monospace\`;
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'left';
    ctx.fillText('AGENCY REEL • 2026', pad + 20 * scale, topY);

    // Status Dot Neon Hijau Berkedip
    const pulse = (Math.sin(t * 6) + 1) * 0.5;
    ctx.fillStyle = '#00ff66';
    ctx.shadowColor = '#00ff66';
    ctx.shadowBlur = (8 * pulse + 4) * scale;
    ctx.beginPath();
    ctx.arc(w - pad - 26 * scale, topY - 4 * scale, 5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 5. Tipografi Kinetik Utama (MAKE IT BOLD / MAKE IT LOUD)
    ctx.textAlign = 'center';
    const centerX = w * 0.5;
    const fontSize = Math.round(Math.min(w * 0.14, 76 * scale));
    ctx.font = \`900 \${fontSize}px Impact, "Arial Black", sans-serif\`;

    const startY = h * 0.35;
    const lineSpacing = fontSize * 1.05;

    // Baris 1: MAKE IT
    const bob1 = Math.sin(t * 3.5) * 4 * scale;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('MAKE IT', centerX, startY + bob1);

    // Baris 2: BOLD. (Neon Green)
    const bob2 = Math.cos(t * 3.5) * 4 * scale;
    ctx.save();
    ctx.fillStyle = '#00ff66';
    ctx.shadowColor = '#00ff66';
    ctx.shadowBlur = (20 + Math.sin(t * 5) * 8) * scale;
    ctx.fillText('BOLD.', centerX, startY + lineSpacing + bob2);
    ctx.restore();

    // Baris 3: MAKE IT
    const bob3 = Math.sin(t * 3.5 + 1.2) * 4 * scale;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('MAKE IT', centerX, startY + lineSpacing * 2 + bob3);

    // Baris 4: LOUD. (Neon Pink)
    const bob4 = Math.cos(t * 3.5 + 1.2) * 4 * scale;
    ctx.save();
    ctx.fillStyle = '#ff0055';
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = (20 + Math.cos(t * 5) * 8) * scale;
    ctx.fillText('LOUD.', centerX, startY + lineSpacing * 3 + bob4);
    ctx.restore();

    // 6. Footer Pills di Bagian Bawah
    const bottomY = h - pad - 24 * scale;
    const pillH = 32 * scale;
    const pillFont = \`900 \${11 * scale}px monospace\`;
    ctx.font = pillFont;

    // Pill Kiri: CREATIVE STUDIO
    const pill1Text = 'CREATIVE STUDIO';
    const p1W = ctx.measureText(pill1Text).width + 24 * scale;
    const p1X = pad + 18 * scale;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p1X, bottomY - pillH, p1W, pillH);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.fillText(pill1Text, p1X + 12 * scale, bottomY - 11 * scale);

    // Pill Kanan: ALLTOOLSKURO
    const pill2Text = 'ALLTOOLSKURO';
    const p2W = ctx.measureText(pill2Text).width + 24 * scale;
    const p2X = w - pad - 18 * scale - p2W;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p2X, bottomY - pillH, p2W, pillH);
    ctx.fillStyle = '#000000';
    ctx.fillText(pill2Text, p2X + 12 * scale, bottomY - 11 * scale);

    ctx.restore();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}`
  },
  {
    id: 'glsl-aurora',
    name: 'GLSL / WebGL Plasma Aurora',
    category: 'hybrid',
    badge: 'GLSL / WEBGL',
    description: 'Shader plasma aurora fluida matematis super smooth 60 FPS menggunakan WebGL fragment shader.',
    defaults: {
      stage3d: false, // Default: OFF (Full Layar Sinematik)
      vignette: true,
      colorBoost: true,
      bgType: 'solid',
      bgColor1: '#04020a',
      bgColor2: '#04020a',
      rotateX: 15,
      rotateY: -20,
      rotateZ: 0,
      zoom: 1.0,
      autoOrbit: true,
      motionSpeed: 1.0,
      clouds: false,
      cloudDensity: 0.3,
      cloudColor: '#120b24',
      particles: false,
      particleStyle: 'dust',
      particleCount: 100,
      particleColor: '#00f0ff',
      hudEnabled: false,
      hudTitle: 'PLASMA AURORA',
      hudSubtitle: 'GLSL FRAGMENT SHADER v1.0',
      hudPosition: 'bottom-left'
    },
    html: `<canvas id="glcanvas"></canvas>`,
    css: `* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
#glcanvas { width: 100%; height: 100%; display: block; }`,
    js: `const canvas = document.getElementById('glcanvas') || document.querySelector('canvas');
if (canvas) {
  function resize() {
    canvas.width = window.innerWidth || 1280;
    canvas.height = window.innerHeight || 720;
  }
  resize();
  window.addEventListener('resize', resize);

  const gl = canvas.getContext('webgl');
  if (gl) {
    const vsSource = \`
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    \`;

    const fsSource = \`
      precision mediump float;
      uniform vec2 u_resolution;
      uniform float u_time;

      void main() {
        vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);
        float t = u_time * 0.8;

        for (float i = 1.0; i < 5.0; i++) {
          uv.x += 0.3 / i * sin(i * 3.0 * uv.y + t);
          uv.y += 0.3 / i * cos(i * 3.0 * uv.x + t);
        }

        vec3 col = vec3(
          0.5 + 0.5 * sin(uv.x * 2.0 + t + 0.0),
          0.5 + 0.5 * sin(uv.y * 2.0 + t + 2.0),
          0.5 + 0.5 * sin((uv.x + uv.y) + t + 4.0)
        );

        gl_FragColor = vec4(col, 1.0);
      }
    \`;

    function createShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    }

    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);
    gl.useProgram(program);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1
    ]), gl.STATIC_DRAW);

    const posAttr = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, 'u_resolution');
    const uTime = gl.getUniformLocation(program, 'u_time');

    function render(now) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now || performance.now()) * 0.001);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  }
}`
  }
];

/**
 * Helper untuk menyatukan HTML, CSS, dan JS menjadi dokumen utuh tunggal
 * dengan reset styling penuh (tanpa margin / padding).
 */
export function buildCompositeHtml(html = '', css = '', js = '') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
    canvas { display: block; width: 100%; height: 100%; }
    ${css}
  </style>
</head>
<body>
  ${html}
  <script>
    ${js}
  </script>
</body>
</html>`;
}

export const TEXT_COLOR_PRESETS = [
  {
    id: 'obsidian-gold',
    name: 'Obsidian Gold',
    bgColor: '#0b0b0f',
    bgSecondary: '#1c170b',
    accentColor: '#facc15',
    textColor: '#ffffff',
    subColor: '#d4d4d8'
  },
  {
    id: 'cyber-emerald',
    name: 'Cyber Emerald',
    bgColor: '#04120e',
    bgSecondary: '#072a20',
    accentColor: '#34d399',
    textColor: '#ecfdf5',
    subColor: '#a7f3d0'
  },
  {
    id: 'crimson-noir',
    name: 'Crimson Noir',
    bgColor: '#120508',
    bgSecondary: '#2d0812',
    accentColor: '#fb7185',
    textColor: '#fff1f2',
    subColor: '#fecdd3'
  },
  {
    id: 'electric-cobalt',
    name: 'Electric Cobalt',
    bgColor: '#050b1a',
    bgSecondary: '#0d1f47',
    accentColor: '#38bdf8',
    textColor: '#f0f9ff',
    subColor: '#bae6fd'
  },
  {
    id: 'clean-editorial',
    name: 'Editorial Ivory',
    bgColor: '#f8fafc',
    bgSecondary: '#e2e8f0',
    accentColor: '#0f172a',
    textColor: '#09090b',
    subColor: '#475569'
  }
];

export const TEXT_ANIMATION_STYLES = [
  { id: 'kinetic-slam', name: 'Kinetic Slam', desc: 'Hentakan tipografi tegas & presisi' },
  { id: 'typewriter-glow', name: 'Typewriter Glow', desc: 'Mesin ketik neon dengan kursor ritmis' },
  { id: 'parallax-slides', name: 'Parallax Slides', desc: 'Lapisan slide bertahap dengan kilau' },
  { id: 'floating-cards', name: 'Floating Cards', desc: 'Kartu poin mengambang halus 60 FPS' },
  { id: 'neon-pulse', name: 'Neon Pulse', desc: 'Aura cahaya dinamis berdenyut' }
];

function isLightHex(hex = '#0b0b0f') {
  const clean = String(hex).replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 165;
}

/**
 * Menghasilkan dokumen HTML5 Canvas 60 FPS deterministik dari konfigurasi Editor Teks.
 * Kompatibel 100% dengan semua rasio aspek & pipeline WebCodecs MP4/WebM.
 */
export function generateTextAnimationDocument(textConfig = {}, durationSec = 10) {
  const preset = TEXT_COLOR_PRESETS.find((p) => p.id === textConfig.presetId) || TEXT_COLOR_PRESETS[0];
  const bgColor = textConfig.bgColor || preset.bgColor;
  const bgSecondary = preset.bgSecondary || bgColor;
  const accentColor = textConfig.accentColor || preset.accentColor;
  const lightBg = isLightHex(bgColor);
  const textColor = lightBg ? '#09090b' : (preset.textColor || '#ffffff');
  const subColor = lightBg ? '#475569' : (preset.subColor || '#cbd5e1');

  const safeCfg = {
    brand: String(textConfig.brand || 'KURO STUDIO').trim(),
    headline: String(textConfig.headline || 'TINGKATKAN PERFORMA BISNIS DIGITAL').trim(),
    subtitle: String(textConfig.subtitle || 'Desain modern, cepat, dan siap konversi dalam hitungan detik.').trim(),
    points: String(textConfig.points || 'Desain Presisi 60 FPS\nTanpa Ribet Coding\nSiap Ekspor HD MP4')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 5),
    cta: String(textConfig.cta || 'MULAI SEKARANG →').trim(),
    styleId: textConfig.styleId || 'kinetic-slam',
    bgColor,
    bgSecondary,
    accentColor,
    textColor,
    subColor,
    lightBg,
    durationSec: Math.max(2, Number(durationSec) || 10)
  };

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>${safeCfg.headline.replace(/</g, '&lt;')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: ${safeCfg.bgColor}; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <canvas id="textVideoCanvas"></canvas>
  <script>
  (function() {
    var CFG = ${JSON.stringify(safeCfg)};
    var canvas = document.getElementById('textVideoCanvas');
    var ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = window.innerWidth || 1280;
      canvas.height = window.innerHeight || 720;
    }
    resize();
    window.addEventListener('resize', resize);

    function clamp01(v) { return Math.max(0, Math.min(1, v)); }
    function easeOutCubic(x) { return 1 - Math.pow(1 - clamp01(x), 3); }
    function easeOutBack(x) {
      var t = clamp01(x);
      var c1 = 1.70158;
      var c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    function wrapLines(ctx, text, maxWidth) {
      if (!text) return [];
      var words = text.split(/\\s+/);
      var lines = [];
      var current = '';
      for (var i = 0; i < words.length; i++) {
        var test = current ? current + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current);
          current = words[i];
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
      return lines;
    }

    function roundRect(ctx, x, y, w, h, r) {
      var radius = Math.min(r, w * 0.5, h * 0.5);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }

    var particles = [];
    for (var i = 0; i < 36; i++) {
      particles.push({
        x: (i * 0.6180339) % 1,
        y: (i * 0.381966) % 1,
        r: 1.5 + (i % 4) * 1.1,
        spd: 0.015 + (i % 5) * 0.006,
        phase: i * 0.9
      });
    }

    function renderFrame(nowMs) {
      var W = canvas.width;
      var H = canvas.height;
      var shortEdge = Math.min(W, H);
      var scale = shortEdge / 720;
      var totalTime = (nowMs || performance.now()) * 0.001;
      var loopT = totalTime % CFG.durationSec;
      var normT = loopT / CFG.durationSec;
      var isPortrait = H > W * 1.05;

      // Backdrop gradient
      var grad = ctx.createRadialGradient(
        W * (0.5 + 0.14 * Math.sin(totalTime * 0.4)),
        H * (0.35 + 0.12 * Math.cos(totalTime * 0.35)),
        shortEdge * 0.05,
        W * 0.5,
        H * 0.5,
        Math.max(W, H) * 0.85
      );
      grad.addColorStop(0, CFG.bgSecondary);
      grad.addColorStop(1, CFG.bgColor);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Subtle architectural grid & floating particles
      ctx.save();
      ctx.strokeStyle = CFG.lightBg ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = Math.max(1, scale);
      var gridGap = Math.max(40, Math.round(72 * scale));
      var gridOffX = (totalTime * 18 * scale) % gridGap;
      var gridOffY = (totalTime * 12 * scale) % gridGap;
      for (var gx = -gridGap + gridOffX; gx < W + gridGap; gx += gridGap) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (var gy = -gridGap + gridOffY; gy < H + gridGap; gy += gridGap) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      // Glowing accent ambient halo
      var haloAlpha = CFG.styleId === 'neon-pulse' ? (0.18 + 0.1 * Math.sin(totalTime * 3.5)) : 0.14;
      ctx.globalAlpha = haloAlpha;
      ctx.fillStyle = CFG.accentColor;
      ctx.beginPath();
      ctx.arc(W * 0.5, H * 0.48, shortEdge * (CFG.styleId === 'neon-pulse' ? (0.38 + 0.04 * Math.sin(totalTime * 2.5)) : 0.34), 0, Math.PI * 2);
      ctx.filter = 'blur(' + Math.round(65 * scale) + 'px)';
      ctx.fill();
      ctx.filter = 'none';
      ctx.globalAlpha = 1;

      for (var p = 0; p < particles.length; p++) {
        var pt = particles[p];
        var px = ((pt.x + totalTime * pt.spd * 0.35) % 1) * W;
        var py = ((pt.y - totalTime * pt.spd) % 1 + 1) % 1 * H;
        ctx.globalAlpha = 0.25 + 0.25 * Math.sin(totalTime * 2 + pt.phase);
        ctx.fillStyle = p % 3 === 0 ? CFG.accentColor : CFG.textColor;
        ctx.beginPath();
        ctx.arc(px, py, pt.r * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Parallax diagonal sweep lines
      if (CFG.styleId === 'parallax-slides' || CFG.styleId === 'neon-pulse') {
        ctx.save();
        ctx.strokeStyle = CFG.accentColor;
        ctx.globalAlpha = 0.16;
        ctx.lineWidth = 3 * scale;
        var sweepX = ((totalTime * 0.45) % 1.4 - 0.2) * W;
        ctx.beginPath();
        ctx.moveTo(sweepX, 0);
        ctx.lineTo(sweepX - H * 0.35, H);
        ctx.stroke();
        ctx.restore();
      }

      // Master typography layout container
      var safeMaxW = W * (isPortrait ? 0.86 : 0.78);
      var centerX = W * 0.5;
      var cursorY = H * (isPortrait ? 0.16 : 0.15);

      // Outro fade at very end of loop for seamless transition
      var globalFade = normT > 0.93 ? clamp01((1 - normT) / 0.07) : 1;
      ctx.save();
      ctx.globalAlpha = globalFade;

      // 1. Brand Pill
      if (CFG.brand) {
        var pBrand = easeOutCubic(loopT / 0.55);
        ctx.save();
        ctx.font = '800 ' + Math.round((isPortrait ? 19 : 21) * scale) + 'px system-ui, -apple-system, Segoe UI, sans-serif';
        var bText = CFG.brand.toUpperCase();
        var bw = ctx.measureText(bText).width + 44 * scale;
        var bh = 42 * scale;
        var by = cursorY + (1 - pBrand) * (-22 * scale);
        ctx.globalAlpha = globalFade * pBrand;
        roundRect(ctx, centerX - bw * 0.5, by, bw, bh, 999);
        ctx.fillStyle = CFG.lightBg ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)';
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, 2 * scale);
        ctx.strokeStyle = CFG.accentColor;
        ctx.stroke();

        ctx.fillStyle = CFG.accentColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bText, centerX, by + bh * 0.5 + scale);
        ctx.restore();
        cursorY += bh + 28 * scale;
      }

      // 2. Hook / Headline
      if (CFG.headline) {
        var headDur = CFG.styleId === 'typewriter-glow' ? 1.5 : 0.75;
        var pHead = clamp01((loopT - 0.18) / headDur);
        var headSize = Math.round((isPortrait ? 48 : 58) * scale);
        ctx.font = '900 ' + headSize + 'px system-ui, -apple-system, Segoe UI, sans-serif';
        var headLines = wrapLines(ctx, CFG.headline, safeMaxW);
        var lineH = headSize * 1.15;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        var shownHeadText = CFG.headline;
        if (CFG.styleId === 'typewriter-glow') {
          var charCount = Math.floor(CFG.headline.length * easeOutCubic(pHead));
          shownHeadText = CFG.headline.slice(0, charCount);
          if (pHead < 1 && Math.floor(totalTime * 6) % 2 === 0) {
            shownHeadText += '|';
          }
          headLines = wrapLines(ctx, shownHeadText, safeMaxW);
        }

        if (CFG.styleId === 'kinetic-slam') {
          var slamScale = 0.7 + 0.3 * easeOutBack(pHead);
          var midY = cursorY + (headLines.length * lineH) * 0.5;
          ctx.translate(centerX, midY);
          ctx.scale(slamScale, slamScale);
          ctx.translate(-centerX, -midY);
          ctx.globalAlpha = globalFade * easeOutCubic(pHead);
        } else if (CFG.styleId === 'parallax-slides') {
          ctx.translate((1 - easeOutCubic(pHead)) * -90 * scale, 0);
          ctx.globalAlpha = globalFade * easeOutCubic(pHead);
        } else {
          ctx.translate(0, (1 - easeOutCubic(pHead)) * 28 * scale);
          ctx.globalAlpha = globalFade * easeOutCubic(pHead);
        }

        if (CFG.styleId === 'neon-pulse' || CFG.styleId === 'typewriter-glow') {
          ctx.shadowColor = CFG.accentColor;
          ctx.shadowBlur = (CFG.styleId === 'neon-pulse' ? 24 : 14) * scale;
        }

        ctx.fillStyle = CFG.textColor;
        for (var hl = 0; hl < headLines.length; hl++) {
          ctx.fillText(headLines[hl], centerX, cursorY + hl * lineH);
        }
        ctx.restore();

        // Accent underline sweep under headline
        var ulProg = easeOutCubic((loopT - 0.5) / 0.6);
        var ulWidth = Math.min(safeMaxW * 0.45, 240 * scale) * ulProg;
        if (ulWidth > 2) {
          ctx.fillStyle = CFG.accentColor;
          roundRect(ctx, centerX - ulWidth * 0.5, cursorY + headLines.length * lineH + 10 * scale, ulWidth, 5 * scale, 4 * scale);
          ctx.fill();
        }
        cursorY += headLines.length * lineH + 34 * scale;
      }

      // 3. Subtitle
      if (CFG.subtitle) {
        var pSub = easeOutCubic((loopT - 0.65) / 0.7);
        var subSize = Math.round((isPortrait ? 24 : 26) * scale);
        ctx.save();
        ctx.font = '600 ' + subSize + 'px system-ui, -apple-system, Segoe UI, sans-serif';
        var subLines = wrapLines(ctx, CFG.subtitle, safeMaxW * 0.92);
        var subLineH = subSize * 1.35;
        var sxOff = CFG.styleId === 'parallax-slides' ? (1 - pSub) * 70 * scale : 0;
        var syOff = CFG.styleId === 'parallax-slides' ? 0 : (1 - pSub) * 20 * scale;
        ctx.translate(sxOff, syOff);
        ctx.globalAlpha = globalFade * pSub;
        ctx.fillStyle = CFG.subColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (var sl = 0; sl < subLines.length; sl++) {
          ctx.fillText(subLines[sl], centerX, cursorY + sl * subLineH);
        }
        ctx.restore();
        cursorY += subLines.length * subLineH + 26 * scale;
      }

      // 4. Staggered Points / Cards
      if (CFG.points && CFG.points.length > 0) {
        var pFontSize = Math.round((isPortrait ? 21 : 22) * scale);
        ctx.font = '700 ' + pFontSize + 'px system-ui, -apple-system, Segoe UI, sans-serif';
        var cardW = Math.min(safeMaxW, 640 * scale);
        var cardH = 50 * scale;
        var gapY = 12 * scale;
        var pointStartDelay = 1.2;
        var stepDelay = Math.min(0.45, Math.max(0.22, (CFG.durationSec * 0.42) / Math.max(1, CFG.points.length)));

        for (var ptIdx = 0; ptIdx < CFG.points.length; ptIdx++) {
          var pItem = clamp01((loopT - (pointStartDelay + ptIdx * stepDelay)) / 0.55);
          var eItem = CFG.styleId === 'floating-cards' ? easeOutBack(pItem) : easeOutCubic(pItem);
          if (eItem <= 0.01) {
            cursorY += cardH + gapY;
            continue;
          }

          var floatY = CFG.styleId === 'floating-cards' ? Math.sin(totalTime * 2.2 + ptIdx * 1.1) * 4 * scale : 0;
          var slideX = CFG.styleId === 'parallax-slides'
            ? (ptIdx % 2 === 0 ? -1 : 1) * (1 - clamp01(eItem)) * 80 * scale
            : 0;
          var cx = centerX - cardW * 0.5 + slideX;
          var cy = cursorY + (1 - clamp01(eItem)) * 22 * scale + floatY;

          ctx.save();
          ctx.globalAlpha = globalFade * clamp01(pItem * 1.2);
          roundRect(ctx, cx, cy, cardW, cardH, 12 * scale);
          ctx.fillStyle = CFG.lightBg ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.08)';
          ctx.fill();
          ctx.lineWidth = Math.max(1.5, 2 * scale);
          ctx.strokeStyle = CFG.styleId === 'neon-pulse'
            ? CFG.accentColor
            : (CFG.lightBg ? 'rgba(15,23,42,0.2)' : 'rgba(255,255,255,0.16)');
          ctx.stroke();

          // Bullet indicator dot
          ctx.fillStyle = CFG.accentColor;
          ctx.beginPath();
          ctx.arc(cx + 26 * scale, cy + cardH * 0.5, 6 * scale, 0, Math.PI * 2);
          ctx.fill();

          // Point text
          ctx.fillStyle = CFG.textColor;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          var label = CFG.points[ptIdx];
          while (label.length > 4 && ctx.measureText(label).width > cardW - 64 * scale) {
            label = label.slice(0, -4) + '...';
          }
          ctx.fillText(label, cx + 46 * scale, cy + cardH * 0.5 + scale);
          ctx.restore();

          cursorY += cardH + gapY;
        }
      }

      // 5. CTA Action Pill at bottom stage
      if (CFG.cta) {
        var ctaDelay = Math.min(CFG.durationSec * 0.65, 2.2);
        var pCta = easeOutBack((loopT - ctaDelay) / 0.6);
        if (pCta > 0.01) {
          var ctaFont = Math.round((isPortrait ? 22 : 24) * scale);
          ctx.save();
          ctx.font = '900 ' + ctaFont + 'px system-ui, -apple-system, Segoe UI, sans-serif';
          var cw = Math.min(safeMaxW, ctx.measureText(CFG.cta).width + 68 * scale);
          var ch = 56 * scale;
          var ctaY = Math.max(cursorY + 14 * scale, H * 0.82);
          if (ctaY + ch > H - 24 * scale) ctaY = H - ch - 24 * scale;

          var pulse = 1 + 0.025 * Math.sin(totalTime * 4.5);
          ctx.translate(centerX, ctaY + ch * 0.5);
          ctx.scale(clamp01(pCta) * pulse, clamp01(pCta) * pulse);
          ctx.translate(-centerX, -(ctaY + ch * 0.5));
          ctx.globalAlpha = globalFade * clamp01((loopT - ctaDelay) / 0.35);

          if (CFG.styleId === 'neon-pulse') {
            ctx.shadowColor = CFG.accentColor;
            ctx.shadowBlur = 22 * scale;
          }

          roundRect(ctx, centerX - cw * 0.5, ctaY, cw, ch, 14 * scale);
          ctx.fillStyle = CFG.accentColor;
          ctx.fill();
          ctx.lineWidth = Math.max(2, 2.5 * scale);
          ctx.strokeStyle = CFG.lightBg ? '#09090b' : 'rgba(255,255,255,0.9)';
          ctx.stroke();

          ctx.shadowBlur = 0;
          ctx.fillStyle = isLightHexColor(CFG.accentColor) ? '#09090b' : '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(CFG.cta, centerX, ctaY + ch * 0.5 + scale);
          ctx.restore();
        }
      }

      ctx.restore();
      requestAnimationFrame(renderFrame);
    }

    function isLightHexColor(hex) {
      var clean = String(hex || '').replace('#', '');
      if (clean.length !== 6) return true;
      var r = parseInt(clean.slice(0, 2), 16);
      var g = parseInt(clean.slice(2, 4), 16);
      var b = parseInt(clean.slice(4, 6), 16);
      return (r * 0.299 + g * 0.587 + b * 0.114) > 145;
    }

    requestAnimationFrame(renderFrame);
  })();
  </script>
</body>
</html>`;
}
