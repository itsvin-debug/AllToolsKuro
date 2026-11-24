/**
 * Kuro Studio - Code to Video Templates v2
 * Kumpulan template animasi visual siap pakai (Hybrid HTML/CSS/JS, Pure Canvas, GLSL Shader, Ads)
 * untuk Code to Video Studio v2.
 */

export const CODE_TEMPLATES = [
  {
    id: 'promo-ad',
    name: 'Iklan Promo Produk Sinematik',
    category: 'hybrid',
    badge: 'HYBRID / AD',
    description: 'Animasi iklan promo modern full-bleed dengan glow dinamis, headline sinematik, badge diskon, dan CTA beranimasi.',
    defaults: {
      stageMode: 'clean', // Mode Polos untuk iklan full-bleed
      bgType: 'gradient',
      bgColor1: '#0a0a14',
      bgColor2: '#160b28',
      rotateX: 0,
      rotateY: 0,
      rotateZ: 0,
      zoom: 1.0,
      autoOrbit: false,
      motionSpeed: 1.0,
      clouds: false,
      cloudDensity: 0.2,
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
  <div class="ad-content">
    <div class="badge-pill">LIMITED TIME &bull; 50% OFF</div>
    <h1 class="ad-title">CYBER DROP <span class="highlight">X-01</span></h1>
    <p class="ad-desc">Sneaker futuristik dengan bantalan ionik dan material serat karbon quantum.</p>
    <div class="price-row">
      <span class="old-price">$299.00</span>
      <span class="new-price">$149.00</span>
    </div>
    <div class="cta-button">
      <span>DAPATKAN SEKARANG</span>
      <div class="cta-glow"></div>
    </div>
  </div>
</div>`,
    css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #080711;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #fff;
}
.ad-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
#ad-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}
.ad-content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px;
  background: rgba(14, 12, 28, 0.75);
  border: 2px solid rgba(0, 240, 255, 0.4);
  border-radius: 24px;
  backdrop-filter: blur(16px);
  box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(0,240,255,0.2);
  max-width: 580px;
}
.badge-pill {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 2.5px;
  color: #ff007f;
  background: rgba(255, 0, 127, 0.15);
  border: 1px solid #ff007f;
  padding: 6px 16px;
  border-radius: 999px;
  margin-bottom: 16px;
  box-shadow: 0 0 15px rgba(255, 0, 127, 0.3);
}
.ad-title {
  font-size: 48px;
  font-weight: 900;
  letter-spacing: -1px;
  line-height: 1.1;
  margin-bottom: 12px;
}
.highlight {
  background: linear-gradient(90deg, #00f0ff, #ff007f);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.ad-desc {
  font-size: 14px;
  color: #a0a0c0;
  max-width: 440px;
  line-height: 1.5;
  margin-bottom: 24px;
}
.price-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 24px;
}
.old-price {
  font-size: 18px;
  color: #666;
  text-decoration: line-through;
  font-family: monospace;
}
.new-price {
  font-size: 38px;
  font-weight: 900;
  color: #00ff88;
  font-family: monospace;
  text-shadow: 0 0 20px rgba(0,255,136,0.4);
}
.cta-button {
  position: relative;
  padding: 14px 36px;
  background: linear-gradient(90deg, #00f0ff, #7928ca);
  border: none;
  border-radius: 999px;
  font-weight: 900;
  letter-spacing: 2px;
  font-size: 14px;
  color: #000;
  box-shadow: 0 0 25px rgba(0,240,255,0.6);
  cursor: pointer;
  overflow: hidden;
}`,
    js: `// Animasi Canvas partikel latar belakang promo
const canvas = document.getElementById('ad-canvas');
if (canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth || 1280;
  canvas.height = window.innerHeight || 720;

  const particles = [];
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 3 + 1,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      color: Math.random() > 0.5 ? '#00f0ff' : '#ff007f'
    });
  }

  function loop() {
    ctx.fillStyle = 'rgba(8, 7, 17, 0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(loop);
  }
  loop();
}`
  },
  {
    id: 'astral-wave',
    name: 'Astral Wave & Hexa Orbit',
    category: 'hybrid',
    badge: 'CANVAS 2D / 3D',
    description: 'Gelombang sinus neon multi-layer dengan cincin orbit heksagonal dan interferensi frekuensi tinggi.',
    defaults: {
      stageMode: '3d', // Mode Studio 3D
      bgType: 'gradient',
      bgColor1: '#070714',
      bgColor2: '#16092b',
      rotateX: 18,
      rotateY: -22,
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
      hudTitle: 'ASTRAL FREQUENCY',
      hudSubtitle: 'HEXA ORBIT MATRIX v2.0',
      hudPosition: 'bottom-left'
    },
    html: `<canvas id="canvas"></canvas>`,
    css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 100vw; height: 100vh; background: #070714; overflow: hidden; }
#canvas { width: 100%; height: 100%; display: block; }`,
    js: `const canvas = document.getElementById('canvas') || window.canvas;
if (canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = 1280;
  canvas.height = 720;
  const w = canvas.width;
  const h = canvas.height;

  function render(time) {
    const t = time * 0.001;
    ctx.fillStyle = 'rgba(7, 7, 20, 0.25)';
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.5;

    // Gambar Heksagon Berputar
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.4);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * 160;
      const y = Math.sin(angle) * 160;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // Heksagon Kedua Berlawanan Arah
    ctx.rotate(-t * 0.8);
    ctx.strokeStyle = '#ff007f';
    ctx.shadowColor = '#ff007f';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * 90;
      const y = Math.sin(angle) * 90;
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
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = cy + Math.sin(x * 0.012 + t * 2.5 + j * 1.2) * (50 + j * 15);
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
      stageMode: '3d',
      bgType: 'gradient',
      bgColor1: '#05020d',
      bgColor2: '#120524',
      rotateX: 24,
      rotateY: -16,
      rotateZ: 0,
      zoom: 1.05,
      autoOrbit: true,
      motionSpeed: 1.0,
      clouds: true,
      cloudDensity: 0.3,
      cloudColor: '#2b0c4f',
      particles: true,
      particleStyle: 'stars',
      particleCount: 150,
      particleColor: '#ff007f',
      hudEnabled: true,
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
const baseRadius = 110;
const numBars = 64;

// Gambar Cahaya Inti Pusat (Central Core Glow)
const coreGlow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 90);
coreGlow.addColorStop(0, '#ffffff');
coreGlow.addColorStop(0.3, '#ff007f');
coreGlow.addColorStop(0.7, '#7928ca');
coreGlow.addColorStop(1, 'transparent');
ctx.fillStyle = coreGlow;
ctx.beginPath();
ctx.arc(cx, cy, 90, 0, Math.PI * 2);
ctx.fill();

// Gambar Inti Berdenyut
const pulse = 18 + Math.sin(time * 6) * 4;
ctx.fillStyle = '#ffffff';
ctx.shadowColor = '#00f0ff';
ctx.shadowBlur = 20;
ctx.beginPath();
ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
ctx.fill();

// Render Bar Spektrum Melingkar
for (let i = 0; i < numBars; i++) {
  const angle = (i / numBars) * Math.PI * 2 + time * 0.2;
  
  // Simulasi amplitudo frekuensi dinamis berdasarkan matematika harmonik
  const freq = Math.sin(i * 0.4 + time * 4) * Math.cos(i * 0.2 - time * 2);
  const barHeight = 20 + Math.abs(freq) * 75 + Math.sin(time * 8 + i) * 12;

  const x1 = cx + Math.cos(angle) * baseRadius;
  const y1 = cy + Math.sin(angle) * baseRadius;
  const x2 = cx + Math.cos(angle) * (baseRadius + barHeight);
  const y2 = cy + Math.sin(angle) * (baseRadius + barHeight);

  const hue = (i / numBars) * 360 + (time * 50) % 360;
  ctx.save();
  ctx.strokeStyle = \`hsl(\${hue}, 100%, 60%)\`;
  ctx.shadowColor = \`hsl(\${hue}, 100%, 60%)\`;
  ctx.shadowBlur = 10;
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
  const rippleRadius = (baseRadius + 90 + (time * 60 * r) % 180);
  const alpha = Math.max(0, 1 - (rippleRadius - baseRadius) / 200);
  ctx.save();
  ctx.strokeStyle = \`rgba(0, 240, 255, \${alpha * 0.4})\`;
  ctx.lineWidth = 1.5;
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
    badge: 'HTML + CSS (9:16)',
    description: 'Animasi tipografi kinetik bergaya agensi modern vertikal untuk TikTok, Instagram Reels, dan YouTube Shorts.',
    defaults: {
      stageMode: 'clean', // Mode Polos untuk hasil tajam di 9:16
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
    html: `<div class="poster">
  <div class="top-tag">AGENCY REEL &bull; 2026</div>
  <div class="line-wrap">
    <div class="huge-text line-1">MAKE IT</div>
  </div>
  <div class="line-wrap">
    <div class="huge-text line-2 highlight">BOLD.</div>
  </div>
  <div class="line-wrap">
    <div class="huge-text line-3">MAKE IT</div>
  </div>
  <div class="line-wrap">
    <div class="huge-text line-4 highlight-pink">LOUD.</div>
  </div>
  <div class="footer-bar">
    <div class="pill">CREATIVE STUDIO</div>
    <div class="pill">ALLTOOLSKURO</div>
  </div>
</div>`,
    css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 100vw;
  height: 100vh;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: Impact, "Arial Black", -apple-system, sans-serif;
  overflow: hidden;
  color: #fff;
}
.poster {
  width: 100%;
  height: 100%;
  padding: 48px 32px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 4px solid #fff;
  background: radial-gradient(circle at 50% 50%, #151515 0%, #000000 100%);
}
.top-tag {
  font-family: monospace;
  font-size: 14px;
  letter-spacing: 4px;
  color: #aaa;
  border-bottom: 2px solid #333;
  padding-bottom: 12px;
}
.huge-text {
  font-size: 82px;
  line-height: 0.9;
  letter-spacing: -2px;
  text-transform: uppercase;
  animation: floatText 3s ease-in-out infinite alternate;
}
.highlight {
  color: #00ff66;
  text-shadow: 0 0 30px rgba(0,255,102,0.6);
}
.highlight-pink {
  color: #ff0055;
  text-shadow: 0 0 30px rgba(255,0,85,0.6);
}
.footer-bar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.pill {
  font-family: monospace;
  font-size: 13px;
  padding: 8px 16px;
  border: 1.5px solid #fff;
  background: #fff;
  color: #000;
  font-weight: 900;
  letter-spacing: 1px;
}
@keyframes floatText {
  0% { transform: scale(0.98) translateY(0); }
  100% { transform: scale(1.02) translateY(-6px); }
}`,
    js: `// Animasi detak ticker bar
console.log('Kinetic Ad Ready.');`
  },
  {
    id: 'glsl-aurora',
    name: 'GLSL / WebGL Plasma Aurora',
    category: 'hybrid',
    badge: 'GLSL / WEBGL',
    description: 'Shader plasma aurora fluida matematis super smooth 60 FPS menggunakan WebGL fragment shader.',
    defaults: {
      stageMode: '3d',
      bgType: 'solid',
      bgColor1: '#04020a',
      bgColor2: '#04020a',
      rotateX: 15,
      rotateY: -20,
      rotateZ: 0,
      zoom: 1.0,
      autoOrbit: true,
      motionSpeed: 1.0,
      clouds: true,
      cloudDensity: 0.3,
      cloudColor: '#120b24',
      particles: true,
      particleStyle: 'dust',
      particleCount: 100,
      particleColor: '#00f0ff',
      hudEnabled: true,
      hudTitle: 'PLASMA AURORA',
      hudSubtitle: 'GLSL FRAGMENT SHADER v1.0',
      hudPosition: 'bottom-left'
    },
    html: `<canvas id="glcanvas"></canvas>`,
    css: `* { margin: 0; padding: 0; }
body { width: 100vw; height: 100vh; overflow: hidden; background: #000; }
#glcanvas { width: 100%; height: 100%; display: block; }`,
    js: `const canvas = document.getElementById('glcanvas');
if (canvas) {
  canvas.width = 1280;
  canvas.height = 720;
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
      gl.uniform1f(uTime, now * 0.001);
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
 */
export function buildCompositeHtml(html = '', css = '', js = '') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 100vw; height: 100vh; overflow: hidden; }
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
