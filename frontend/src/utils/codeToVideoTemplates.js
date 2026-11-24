/**
 * Kuro Studio - Code to Video Templates
 * Kumpulan template animasi visual siap pakai (Canvas 2D & HTML/CSS 3D)
 * untuk Code to Video Studio.
 */

export const CODE_TEMPLATES = [
  {
    id: 'neon-wave',
    name: 'Neon Cyber Wave',
    category: 'canvas',
    badge: 'CANVAS 2D',
    description: 'Osilator gelombang sinus neon bercahaya dengan interferensi harmonik dan jejak partikel glow.',
    defaults: {
      bgType: 'gradient',
      bgColor1: '#070714',
      bgColor2: '#16092b',
      rotateX: 16,
      rotateY: -20,
      rotateZ: 0,
      zoom: 1.05,
      autoOrbit: true,
      motionSpeed: 1.0,
      clouds: true,
      cloudDensity: 0.35,
      cloudColor: '#211042',
      particles: true,
      particleStyle: 'sparks',
      particleCount: 120,
      particleColor: '#00f0ff',
      hudEnabled: true,
      hudTitle: 'CYBER HARMONICS',
      hudSubtitle: 'NEON OSCILLOSCOPE FREQUENCY v2.4',
      hudPosition: 'bottom-left'
    },
    code: `// --- NEON CYBER WAVE ANIMATION ---
// Didukung objek global: canvas, ctx, width, height, t (detik)

const waves = [
  { color: '#00f0ff', freq: 0.012, speed: 2.2, amp: 70, phase: 0 },
  { color: '#ff007f', freq: 0.018, speed: -1.8, amp: 55, phase: Math.PI / 3 },
  { color: '#7928ca', freq: 0.009, speed: 1.4, amp: 85, phase: Math.PI / 1.5 },
  { color: '#00ff88', freq: 0.024, speed: -2.8, amp: 40, phase: Math.PI }
];

// Latar belakang gelap transparan untuk efek jejak (motion trail)
ctx.fillStyle = 'rgba(10, 10, 24, 0.25)';
ctx.fillRect(0, 0, width, height);

const centerY = height * 0.52;

// Gambar grid neon horizontal & vertikal halus di latar belakang
ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
ctx.lineWidth = 1;
for (let y = 0; y < height; y += 40) {
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
}
for (let x = 0; x < width; x += 50) {
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
}

// Render setiap lapisan gelombang harmonik
waves.forEach((w, idx) => {
  ctx.save();
  ctx.strokeStyle = w.color;
  ctx.shadowColor = w.color;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 3.5;
  ctx.beginPath();

  for (let x = 0; x <= width; x += 4) {
    const timeOffset = t * w.speed;
    const y1 = Math.sin(x * w.freq + timeOffset + w.phase) * w.amp;
    const y2 = Math.cos(x * (w.freq * 0.6) - timeOffset * 0.7) * (w.amp * 0.45);
    const y = centerY + y1 + y2;

    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    // Render node partikel bercahaya pada titik simpul tertentu
    if (x % 120 === 0 && (x + Math.floor(t * 30)) % 240 < 120) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = w.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.stroke();
  ctx.restore();
});

// Garis horizon pusat bercahaya halus
ctx.save();
ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
ctx.setLineDash([8, 12]);
ctx.beginPath();
ctx.moveTo(0, centerY);
ctx.lineTo(width, centerY);
ctx.stroke();
ctx.restore();`
  },
  {
    id: 'cyber-matrix',
    name: 'Cyber Matrix Rain',
    category: 'canvas',
    badge: 'CANVAS 2D',
    description: 'Hujan kode digital Matrix legendaris dengan karakter Katakana Jepang dan kilau neon hijau.',
    defaults: {
      bgType: 'solid',
      bgColor1: '#020d06',
      bgColor2: '#020d06',
      rotateX: 12,
      rotateY: -16,
      rotateZ: 0,
      zoom: 1.0,
      autoOrbit: true,
      motionSpeed: 1.0,
      clouds: true,
      cloudDensity: 0.25,
      cloudColor: '#052912',
      particles: true,
      particleStyle: 'dust',
      particleCount: 100,
      particleColor: '#00ff66',
      hudEnabled: true,
      hudTitle: 'NEURAL STREAM',
      hudSubtitle: 'MAINFRAME CIPHER PROTOCOL v4',
      hudPosition: 'top-left'
    },
    code: `// --- CYBER MATRIX RAIN ---
// Didukung objek global: canvas, ctx, width, height, t (detik)

const fontSize = 16;
const columns = Math.floor(width / fontSize);

// Inisialisasi posisi tetesan (drops) jika belum ada di state
if (!window._matrixDrops || window._matrixDrops.length !== columns) {
  window._matrixDrops = [];
  for (let i = 0; i < columns; i++) {
    window._matrixDrops[i] = Math.floor(Math.random() * -50);
  }
}

// Efek jejak pudar transparan hitam Matrix
ctx.fillStyle = 'rgba(2, 13, 6, 0.22)';
ctx.fillRect(0, 0, width, height);

// Kumpulan glif Katakana & angka Matrix
const chars = 'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ0123456789XYZW#&*';

ctx.font = 'bold ' + fontSize + 'px monospace';

for (let i = 0; i < columns; i++) {
  // Ambil karakter acak
  const char = chars.charAt(Math.floor(Math.random() * chars.length));
  const x = i * fontSize;
  const y = window._matrixDrops[i] * fontSize;

  // Kepala tetesan berwarna putih terang
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#00ff66';
  ctx.shadowBlur = 10;
  ctx.fillText(char, x, y);

  // Ekor tetesan berwarna hijau Matrix menyala
  if (y > fontSize) {
    const trailChar = chars.charAt(Math.floor(Math.random() * chars.length));
    ctx.fillStyle = '#00ff66';
    ctx.shadowBlur = 6;
    ctx.fillText(trailChar, x, y - fontSize);
  }

  // Update posisi tetesan dengan kecepatan bervariasi
  if (y > height && Math.random() > 0.975) {
    window._matrixDrops[i] = 0;
  } else {
    window._matrixDrops[i]++;
  }
}

// Overlay scanline retro Matrix
ctx.fillStyle = 'rgba(0, 255, 102, 0.03)';
for (let s = 0; s < height; s += 4) {
  ctx.fillRect(0, s, width, 1.5);
}`
  },
  {
    id: 'glass-card',
    name: '3D Hologram Card',
    category: 'html',
    badge: 'HTML / CSS 3D',
    description: 'Kartu glassmorphism futuristik mengapung di ruang 3D dengan refleksi cahaya dan efek shimmer.',
    defaults: {
      bgType: 'gradient',
      bgColor1: '#0a0a1a',
      bgColor2: '#1f1035',
      rotateX: 20,
      rotateY: -24,
      rotateZ: 0,
      zoom: 1.1,
      autoOrbit: true,
      motionSpeed: 1.0,
      clouds: true,
      cloudDensity: 0.45,
      cloudColor: '#30145c',
      particles: true,
      particleStyle: 'stars',
      particleCount: 150,
      particleColor: '#e0c3fc',
      hudEnabled: true,
      hudTitle: 'HOLO INTERFACE',
      hudSubtitle: 'GLASSMORPHIC QUANTUM ACCESS PASS',
      hudPosition: 'bottom-center'
    },
    code: `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 50%, #15102a 0%, #080612 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      perspective: 1000px;
    }
    
    .card-wrap {
      position: relative;
      width: 480px;
      height: 290px;
      background: linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 100%);
      border: 1.5px solid rgba(255, 255, 255, 0.28);
      border-radius: 24px;
      padding: 32px;
      box-shadow: 0 30px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.4);
      backdrop-filter: blur(20px);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: #fff;
      animation: floatMotion 6s ease-in-out infinite alternate;
    }

    .shimmer {
      position: absolute;
      top: -100%;
      left: -100%;
      width: 300%;
      height: 300%;
      background: linear-gradient(
        45deg,
        transparent 40%,
        rgba(255, 255, 255, 0.12) 50%,
        transparent 60%
      );
      animation: shimmerSweep 4s linear infinite;
      pointer-events: none;
      border-radius: 24px;
    }

    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .chip {
      width: 48px;
      height: 36px;
      background: linear-gradient(135deg, #ffd700, #ff8c00);
      border-radius: 6px;
      box-shadow: 0 0 16px rgba(255, 215, 0, 0.4);
    }

    .brand {
      font-weight: 800;
      letter-spacing: 3px;
      font-size: 15px;
      background: linear-gradient(90deg, #00f0ff, #ff007f);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .number {
      font-family: monospace;
      font-size: 24px;
      letter-spacing: 4px;
      text-shadow: 0 2px 8px rgba(0,0,0,0.5);
    }

    .bottom-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 13px;
      color: rgba(255,255,255,0.7);
    }

    .label {
      font-size: 10px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 4px;
      color: rgba(255,255,255,0.5);
    }

    .val {
      font-weight: 600;
      color: #fff;
      letter-spacing: 1px;
    }

    @keyframes floatMotion {
      0% { transform: translateY(0px) rotateY(-4deg) rotateX(4deg); }
      100% { transform: translateY(-14px) rotateY(4deg) rotateX(-4deg); }
    }

    @keyframes shimmerSweep {
      0% { transform: translateX(-50%) translateY(-50%) rotate(0deg); }
      100% { transform: translateX(50%) translateY(50%) rotate(0deg); }
    }
  </style>
</head>
<body>
  <div class="card-wrap">
    <div class="shimmer"></div>
    <div class="top-bar">
      <div class="chip"></div>
      <div class="brand">KURO // QUANTUM</div>
    </div>
    <div class="number">8492 &bull; 0192 &bull; 5504 &bull; 7731</div>
    <div class="bottom-bar">
      <div>
        <div class="label">PASS HOLDER</div>
        <div class="val">CORE OPERATOR</div>
      </div>
      <div>
        <div class="label">SECURE EXP</div>
        <div class="val">12 / 29</div>
      </div>
    </div>
  </div>
</body>
</html>`
  },
  {
    id: 'solar-system',
    name: 'Solar System Orbit',
    category: 'canvas',
    badge: 'CANVAS 2D',
    description: 'Simulasi orbit tata surya kosmik dengan pancaran korona matahari dan cincin partikel gravitasi.',
    defaults: {
      bgType: 'gradient',
      bgColor1: '#04020a',
      bgColor2: '#0b081a',
      rotateX: 34,
      rotateY: -12,
      rotateZ: 0,
      zoom: 1.0,
      autoOrbit: true,
      motionSpeed: 1.0,
      clouds: false,
      cloudDensity: 0.15,
      cloudColor: '#120b24',
      particles: true,
      particleStyle: 'stars',
      particleCount: 200,
      particleColor: '#ffffff',
      hudEnabled: true,
      hudTitle: 'CELESTIAL ORBIT',
      hudSubtitle: 'GRAVITATIONAL SIMULATION v1.0',
      hudPosition: 'top-center'
    },
    code: `// --- SOLAR SYSTEM ORBIT ---
// Didukung objek global: canvas, ctx, width, height, t (detik)

ctx.fillStyle = 'rgba(4, 2, 10, 0.28)';
ctx.fillRect(0, 0, width, height);

const cx = width * 0.5;
const cy = height * 0.5;

// Gambar Matahari Pusat dengan pancaran korona
const sunRadius = 26 + Math.sin(t * 3) * 2;
const sunGlow = ctx.createRadialGradient(cx, cy, 5, cx, cy, 75);
sunGlow.addColorStop(0, '#ffffff');
sunGlow.addColorStop(0.3, '#ffaa00');
sunGlow.addColorStop(0.7, '#ff3300');
sunGlow.addColorStop(1, 'transparent');

ctx.fillStyle = sunGlow;
ctx.beginPath();
ctx.arc(cx, cy, 75, 0, Math.PI * 2);
ctx.fill();

ctx.fillStyle = '#fffae0';
ctx.beginPath();
ctx.arc(cx, cy, sunRadius, 0, Math.PI * 2);
ctx.fill();

// Data Planet
const planets = [
  { dist: 70, speed: 2.2, r: 5, color: '#00f0ff', trail: [] },
  { dist: 110, speed: 1.6, r: 7.5, color: '#ff66aa', trail: [] },
  { dist: 160, speed: 1.1, r: 9, color: '#33ccff', trail: [] },
  { dist: 220, speed: 0.7, r: 14, color: '#ffaa33', ring: true, trail: [] },
  { dist: 280, speed: 0.45, r: 10, color: '#7755ff', trail: [] }
];

planets.forEach((p) => {
  // Gambar lintasan orbit elips halus
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, p.dist, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Posisi planet
  const angle = t * p.speed;
  const px = cx + Math.cos(angle) * p.dist;
  const py = cy + Math.sin(angle) * p.dist;

  // Cincin Planet jika ada
  if (p.ring) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 170, 51, 0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(px, py, p.r * 1.8, p.r * 0.7, Math.PI / 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Tubuh planet
  ctx.save();
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(px, py, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
});`
  },
  {
    id: 'kinetic-typography',
    name: 'Kinetic Typography',
    category: 'html',
    badge: 'HTML / CSS 3D',
    description: 'Tipografi kinetik cyberpunk bertingkat dengan teks dinamis, teks bergradasi, dan aksen neon.',
    defaults: {
      bgType: 'gradient',
      bgColor1: '#050505',
      bgColor2: '#1a0505',
      rotateX: 18,
      rotateY: -15,
      rotateZ: 0,
      zoom: 1.05,
      autoOrbit: true,
      motionSpeed: 1.0,
      clouds: true,
      cloudDensity: 0.3,
      cloudColor: '#360909',
      particles: true,
      particleStyle: 'sparks',
      particleCount: 130,
      particleColor: '#ff2d55',
      hudEnabled: true,
      hudTitle: 'KINETIC MOTION',
      hudSubtitle: 'CYBERPUNK TITLE GENERATOR',
      hudPosition: 'bottom-left'
    },
    code: `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #060608;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Impact, sans-serif;
      overflow: hidden;
      color: #fff;
    }

    .poster {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      text-transform: uppercase;
    }

    .tag {
      font-size: 13px;
      letter-spacing: 6px;
      font-weight: 700;
      color: #ff0055;
      padding: 6px 16px;
      border: 1px solid #ff0055;
      border-radius: 999px;
      box-shadow: 0 0 15px rgba(255, 0, 85, 0.4);
      animation: pulseGlow 2s infinite alternate;
    }

    .hero-title {
      font-size: 72px;
      font-weight: 900;
      letter-spacing: -2px;
      line-height: 0.95;
      text-align: center;
      background: linear-gradient(180deg, #ffffff 20%, #888888 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      text-shadow: 0 10px 30px rgba(0,0,0,0.8);
      animation: textFloat 3s ease-in-out infinite alternate;
    }

    .highlight {
      background: linear-gradient(90deg, #ff0055, #ffaa00);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .sub-bar {
      margin-top: 10px;
      display: flex;
      gap: 18px;
      font-size: 13px;
      font-family: monospace;
      color: rgba(255,255,255,0.6);
      letter-spacing: 2px;
    }

    .dot { color: #ff0055; }

    @keyframes pulseGlow {
      0% { opacity: 0.7; transform: scale(0.98); }
      100% { opacity: 1; transform: scale(1.02); }
    }

    @keyframes textFloat {
      0% { transform: translateY(0px) rotate(0deg); }
      100% { transform: translateY(-8px) rotate(-1deg); }
    }
  </style>
</head>
<body>
  <div class="poster">
    <div class="tag">FUTURE PRODUCTION</div>
    <div class="hero-title">
      UNLEASH<br>
      <span class="highlight">CREATIVITY</span>
    </div>
    <div class="sub-bar">
      <span>FPS: 60</span>
      <span class="dot">&bull;</span>
      <span>RENDER: 1440P</span>
      <span class="dot">&bull;</span>
      <span>CODE: ACTIVE</span>
    </div>
  </div>
</body>
</html>`
  }
];
