/**
 * Kuro Studio - Code to Video Engine
 * Mesin Compositor 3D Three.js, Sandbox Runner, Atmospheric FX (Awan & Partikel),
 * dan Video Exporter (WebCodecs MP4 via mp4-muxer & MediaRecorder WebM).
 */

import * as THREE from 'three';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

/**
 * Menghitung dimensi video (w & h) genap kelipatan 2 untuk codec video H.264
 */
export function computeTargetDimensions(resolution = '1080p', aspectRatio = '16:9') {
  const shortEdges = {
    '480p': 480,
    '720p': 720,
    '1080p': 1080,
    '1440p': 1440
  };
  const targetEdge = shortEdges[resolution] || 1080;

  let w = 1920;
  let h = 1080;

  switch (aspectRatio) {
    case '16:9':
      h = targetEdge;
      w = Math.round((h * 16) / 9);
      break;
    case '9:16':
      w = targetEdge;
      h = Math.round((w * 16) / 9);
      break;
    case '1:1':
      w = targetEdge;
      h = targetEdge;
      break;
    case '4:5':
      w = targetEdge;
      h = Math.round((w * 5) / 4);
      break;
    case '21:9':
      h = targetEdge;
      w = Math.round((h * 21) / 9);
      break;
    default:
      h = targetEdge;
      w = Math.round((h * 16) / 9);
  }

  // Pastikan angka selalu genap (kelipatan 2)
  w = (w >> 1) << 1;
  h = (h >> 1) << 1;

  return { width: w, height: h };
}

export const BITRATE_PRESETS = {
  light: 2_500_000,
  standard: 6_000_000,
  high: 12_000_000,
  ultra: 24_000_000
};

/**
 * Membuat tekstur lingkaran glow lembut untuk partikel udara
 */
function createParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 32, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Membuat tekstur awan lembut prosedural
 */
function createCloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
  grad.addColorStop(0.8, 'rgba(255, 255, 255, 0.15)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Master Compositor 3D Three.js
 */
export class CodeToVideoCompositor {
  constructor(containerCanvas, width = 1280, height = 720) {
    this.containerCanvas = containerCanvas;
    this.width = width;
    this.height = height;

    // Canvas konten kode (2D buffer yang dirender oleh sandbox pengguna)
    this.codeCanvas = document.createElement('canvas');
    this.codeCanvas.width = 1280;
    this.codeCanvas.height = 720;
    this.codeCtx = this.codeCanvas.getContext('2d');

    // Canvas overlay 2D untuk tipografi & HUD
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = width;
    this.hudCanvas.height = height;
    this.hudCtx = this.hudCanvas.getContext('2d');

    // Canvas master akhir untuk export video
    this.masterCanvas = document.createElement('canvas');
    this.masterCanvas.width = width;
    this.masterCanvas.height = height;
    this.masterCtx = this.masterCanvas.getContext('2d');

    // Inisialisasi Three.js WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.containerCanvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 4.4);

    // Tekstur dasar
    this.particleTexture = createParticleTexture();
    this.cloudTexture = createCloudTexture();

    // Background plane di belakang scene
    this.initBackgroundLayer();

    // 3D Code Plane
    this.initCodePlane();

    // Atmospheric Effects: Awan & Partikel
    this.initAtmosphericEffects();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;

    this.hudCanvas.width = width;
    this.hudCanvas.height = height;
    this.masterCanvas.width = width;
    this.masterCanvas.height = height;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  initBackgroundLayer() {
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = 512;
    this.bgCanvas.height = 512;
    this.bgCtx = this.bgCanvas.getContext('2d');
    this.bgTexture = new THREE.CanvasTexture(this.bgCanvas);

    const bgGeo = new THREE.PlaneGeometry(16, 12);
    const bgMat = new THREE.MeshBasicMaterial({
      map: this.bgTexture,
      depthWrite: false
    });
    this.bgMesh = new THREE.Mesh(bgGeo, bgMat);
    this.bgMesh.position.z = -3.5;
    this.scene.add(this.bgMesh);
  }

  updateBackground(settings) {
    if (!this.bgCtx) return;
    const { bgType = 'gradient', bgColor1 = '#070714', bgColor2 = '#16092b' } = settings;

    if (bgType === 'solid') {
      this.bgCtx.fillStyle = bgColor1;
      this.bgCtx.fillRect(0, 0, 512, 512);
    } else {
      const grad = this.bgCtx.createLinearGradient(0, 0, 512, 512);
      grad.addColorStop(0, bgColor1);
      grad.addColorStop(1, bgColor2);
      this.bgCtx.fillStyle = grad;
      this.bgCtx.fillRect(0, 0, 512, 512);
    }
    this.bgTexture.needsUpdate = true;
  }

  initCodePlane() {
    this.codeTexture = new THREE.CanvasTexture(this.codeCanvas);
    this.codeTexture.minFilter = THREE.LinearFilter;
    this.codeTexture.magFilter = THREE.LinearFilter;

    // Bingkai belakang warna hitam neobrutalist
    const frameGeo = new THREE.PlaneGeometry(3.3, 1.9);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.frameMesh = new THREE.Mesh(frameGeo, frameMat);
    this.frameMesh.position.z = -0.01;

    // Layar kode
    const planeGeo = new THREE.PlaneGeometry(3.2, 1.8);
    const planeMat = new THREE.MeshBasicMaterial({
      map: this.codeTexture,
      transparent: true
    });
    this.codeMesh = new THREE.Mesh(planeGeo, planeMat);

    // Group untuk memudahkan rotasi gabungan
    this.codeGroup = new THREE.Group();
    this.codeGroup.add(this.frameMesh);
    this.codeGroup.add(this.codeMesh);
    this.scene.add(this.codeGroup);
  }

  initAtmosphericEffects() {
    // 1. Lapisan Awan Prosedural 3D
    this.cloudGroup = new THREE.Group();
    this.cloudPlanes = [];

    const cloudPuffs = [
      { x: -1.8, y: 0.9, z: -1.2, scale: 2.2, speed: 0.08 },
      { x: 1.6, y: -0.7, z: -0.8, scale: 2.5, speed: 0.06 },
      { x: -0.8, y: -1.1, z: 0.4, scale: 2.0, speed: 0.1 },
      { x: 1.2, y: 1.0, z: 0.8, scale: 2.4, speed: 0.07 }
    ];

    const cloudGeo = new THREE.PlaneGeometry(2, 2);
    cloudPuffs.forEach((puff) => {
      const cloudMat = new THREE.MeshBasicMaterial({
        map: this.cloudTexture,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.NormalBlending
      });
      const mesh = new THREE.Mesh(cloudGeo, cloudMat);
      mesh.position.set(puff.x, puff.y, puff.z);
      mesh.scale.set(puff.scale, puff.scale, 1);
      mesh.userData = { ...puff, initialX: puff.x, initialY: puff.y };
      this.cloudPlanes.push(mesh);
      this.cloudGroup.add(mesh);
    });

    this.scene.add(this.cloudGroup);

    // 2. Partikel Udara 3D
    this.maxParticles = 300;
    this.particleGeo = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(this.maxParticles * 3);
    this.particleVelocities = [];

    for (let i = 0; i < this.maxParticles; i++) {
      this.particlePositions[i * 3] = (Math.random() - 0.5) * 8;
      this.particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 6;
      this.particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 4;

      this.particleVelocities.push({
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        vz: (Math.random() - 0.5) * 0.1,
        seed: Math.random() * 10
      });
    }

    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));

    this.particleMat = new THREE.PointsMaterial({
      size: 0.12,
      map: this.particleTexture,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0x00f0ff
    });

    this.particlePoints = new THREE.Points(this.particleGeo, this.particleMat);
    this.scene.add(this.particlePoints);
  }

  /**
   * Update transformasi 3D, partikel, awan, dan kamera berdasarkan parameter
   */
  updateScene(t, settings) {
    const {
      rotateX = 16,
      rotateY = -20,
      rotateZ = 0,
      zoom = 1.05,
      autoOrbit = true,
      motionSpeed = 1.0,
      clouds = true,
      cloudDensity = 0.35,
      cloudColor = '#211042',
      particles = true,
      particleStyle = 'sparks',
      particleCount = 120,
      particleColor = '#00f0ff'
    } = settings;

    // Rotasi dasar kartu kode (konversi derajat ke radian)
    let rx = (rotateX * Math.PI) / 180;
    let ry = (rotateY * Math.PI) / 180;
    let rz = (rotateZ * Math.PI) / 180;
    let py = 0;

    // Auto-orbit / pernapasan melayang di ruang 3D
    if (autoOrbit) {
      const spd = motionSpeed || 1.0;
      rx += Math.sin(t * 0.9 * spd) * 0.05;
      ry += Math.cos(t * 0.7 * spd) * 0.07;
      py = Math.sin(t * 1.1 * spd) * 0.06;
    }

    this.codeGroup.rotation.x = rx;
    this.codeGroup.rotation.y = ry;
    this.codeGroup.rotation.z = rz;
    this.codeGroup.position.y = py;

    // Posisi kamera (Zoom)
    const safeZoom = Math.max(0.4, Math.min(zoom || 1.0, 2.5));
    this.camera.position.z = 4.4 / safeZoom;

    // 1. Update Awan 3D
    this.cloudGroup.visible = Boolean(clouds && cloudDensity > 0);
    if (this.cloudGroup.visible) {
      const cColor = new THREE.Color(cloudColor || '#211042');
      this.cloudPlanes.forEach((plane) => {
        plane.material.opacity = cloudDensity * 0.6;
        plane.material.color = cColor;

        const u = plane.userData;
        // Hanyut perlahan secara horizontal
        const drift = (t * u.speed * (motionSpeed || 1.0)) % 8;
        plane.position.x = u.initialX + drift;
        if (plane.position.x > 4) plane.position.x -= 8;
        plane.position.y = u.initialY + Math.sin(t * 0.5 + u.z) * 0.12;
      });
    }

    // 2. Update Partikel Udara 3D
    this.particlePoints.visible = Boolean(particles && particleCount > 0);
    if (this.particlePoints.visible) {
      this.particleMat.color = new THREE.Color(particleColor || '#00f0ff');
      const positions = this.particleGeo.attributes.position.array;
      const count = Math.min(particleCount, this.maxParticles);
      const spd = motionSpeed || 1.0;

      for (let i = 0; i < count; i++) {
        const vel = this.particleVelocities[i];
        let px = positions[i * 3];
        let py = positions[i * 3 + 1];
        let pz = positions[i * 3 + 2];

        if (particleStyle === 'snow') {
          // Salju turun ke bawah
          py -= (0.4 + vel.seed * 0.05) * spd * 0.02;
          px += Math.sin(t * 1.5 + vel.seed) * 0.008 * spd;
          if (py < -3.2) py = 3.2;
        } else if (particleStyle === 'sparks') {
          // Percikan api naik ke atas
          py += (0.6 + vel.seed * 0.08) * spd * 0.02;
          px += Math.sin(t * 2.5 + vel.seed) * 0.01 * spd;
          if (py > 3.2) py = -3.2;
        } else if (particleStyle === 'stars') {
          // Bintang berkelap-kelip halus di tempat
          const twinkle = Math.sin(t * 4 + vel.seed);
          px += Math.sin(t * 0.4 + vel.seed) * 0.003;
          py += Math.cos(t * 0.3 + vel.seed) * 0.003;
        } else {
          // Dust bokeh gerak brownian lembut
          px += Math.sin(t * 0.6 + vel.seed) * 0.005 * spd;
          py += Math.cos(t * 0.5 + vel.seed) * 0.005 * spd;
          pz += Math.sin(t * 0.4 + vel.seed) * 0.004 * spd;
        }

        // Batasi ruang agar tidak keluar pandangan kamera
        if (px > 4.2) px = -4.2;
        if (px < -4.2) px = 4.2;
        if (py > 3.2) py = -3.2;
        if (py < -3.2) py = 3.2;

        positions[i * 3] = px;
        positions[i * 3 + 1] = py;
        positions[i * 3 + 2] = pz;
      }

      this.particleGeo.setDrawRange(0, count);
      this.particleGeo.attributes.position.needsUpdate = true;
    }
  }

  /**
   * Render overlay tipografi & HUD 2D
   */
  renderHud(settings) {
    const {
      hudEnabled = true,
      hudTitle = '',
      hudSubtitle = '',
      hudPosition = 'bottom-left'
    } = settings;

    this.hudCtx.clearRect(0, 0, this.width, this.height);
    if (!hudEnabled || (!hudTitle && !hudSubtitle)) return;

    const ctx = this.hudCtx;
    ctx.save();

    // Hitung posisi berdasarkan pilihan alignment
    let x = 40;
    let y = this.height - 100;
    let align = 'left';

    if (hudPosition === 'top-left') {
      x = 44;
      y = 56;
      align = 'left';
    } else if (hudPosition === 'top-center') {
      x = this.width / 2;
      y = 56;
      align = 'center';
    } else if (hudPosition === 'bottom-center') {
      x = this.width / 2;
      y = this.height - 100;
      align = 'center';
    } else {
      // bottom-left default
      x = 44;
      y = this.height - 100;
      align = 'left';
    }

    ctx.textAlign = align;

    // Gambar pill container neobrutalist
    ctx.save();
    const titleText = (hudTitle || '').toUpperCase();
    const subText = (hudSubtitle || '').toUpperCase();

    // Ukuran font adaptif terhadap resolusi layar
    const scaleFactor = Math.max(1, this.height / 720);
    const titleSize = Math.round(20 * scaleFactor);
    const subSize = Math.round(11 * scaleFactor);

    ctx.font = `900 ${titleSize}px monospace`;
    const titleWidth = ctx.measureText(titleText).width;

    ctx.font = `600 ${subSize}px monospace`;
    const subWidth = ctx.measureText(subText).width;

    const boxWidth = Math.max(titleWidth, subWidth) + 36 * scaleFactor;
    const boxHeight = 64 * scaleFactor;

    let boxX = x;
    if (align === 'center') {
      boxX = x - boxWidth / 2;
    }

    // Shadow neobrutalist hitam pekat
    ctx.fillStyle = '#000000';
    ctx.fillRect(boxX + 4 * scaleFactor, y + 4 * scaleFactor, boxWidth, boxHeight);

    // Box latar belakang putih dengan border hitam tegas
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(boxX, y, boxWidth, boxHeight);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5 * scaleFactor;
    ctx.strokeRect(boxX, y, boxWidth, boxHeight);

    // Aksen dot indicator merah menyala (REC status)
    ctx.fillStyle = '#ff0055';
    ctx.beginPath();
    ctx.arc(boxX + 16 * scaleFactor, y + 22 * scaleFactor, 5 * scaleFactor, 0, Math.PI * 2);
    ctx.fill();

    // Render Judul
    ctx.fillStyle = '#000000';
    ctx.font = `900 ${titleSize}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(titleText, boxX + 28 * scaleFactor, y + 28 * scaleFactor);

    // Render Subtitle
    ctx.fillStyle = '#444444';
    ctx.font = `700 ${subSize}px monospace`;
    ctx.fillText(subText, boxX + 28 * scaleFactor, y + 48 * scaleFactor);

    ctx.restore();
    ctx.restore();
  }

  /**
   * Menggabungkan WebGL Canvas dan 2D HUD ke Master Canvas untuk export
   */
  compositeMasterFrame() {
    this.masterCtx.clearRect(0, 0, this.width, this.height);
    // 1. Gambar Three.js WebGL Canvas
    this.masterCtx.drawImage(this.containerCanvas, 0, 0, this.width, this.height);
    // 2. Gambar HUD Overlay
    this.masterCtx.drawImage(this.hudCanvas, 0, 0, this.width, this.height);
  }

  /**
   * Render satu frame lengkap pada waktu `t`
   */
  renderFrame(t, settings) {
    this.updateBackground(settings);
    this.updateScene(t, settings);
    this.codeTexture.needsUpdate = true;

    // Render WebGL 3D
    this.renderer.render(this.scene, this.camera);

    // Render HUD
    this.renderHud(settings);

    // Composite ke Master Canvas
    this.compositeMasterFrame();
  }

  dispose() {
    this.renderer.dispose();
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.codeTexture.dispose();
    this.bgTexture.dispose();
  }
}

/**
 * Runner Sandbox untuk Kode Animasi Pengguna
 */
export class CodeSandboxRunner {
  constructor(compositor) {
    this.compositor = compositor;
    this.lastError = null;
    this.compiledCanvasFn = null;
    this.isHtmlMode = false;

    // Siapkan Iframe tersembunyi untuk mode HTML
    this.iframe = document.createElement('iframe');
    this.iframe.style.position = 'fixed';
    this.iframe.style.top = '-9999px';
    this.iframe.style.left = '-9999px';
    this.iframe.style.width = '1280px';
    this.iframe.style.height = '720px';
    this.iframe.style.border = 'none';
    this.iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    document.body.appendChild(this.iframe);
  }

  updateCode(code, type = 'auto') {
    this.lastError = null;
    this.code = code;

    // Deteksi otomatis apakah kode merupakan HTML atau Canvas Script murni
    const trimmed = (code || '').trim();
    const isHtml = type === 'html' || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.includes('<style>') || trimmed.includes('<body>');
    this.isHtmlMode = isHtml;

    if (!isHtml) {
      try {
        // Kompilasi JavaScript Canvas Script
        // Argumen: canvas, ctx, width, height, t, window
        this.compiledCanvasFn = new Function('canvas', 'ctx', 'width', 'height', 't', 'window', code);
      } catch (err) {
        this.lastError = `Syntax Error: ${err.message}`;
        this.compiledCanvasFn = null;
      }
    } else {
      // Injeksi ke Iframe sandbox
      this.iframe.srcdoc = code;
    }
  }

  renderStep(t) {
    if (this.lastError) return;

    if (!this.isHtmlMode && this.compiledCanvasFn) {
      try {
        const c = this.compositor.codeCanvas;
        const ctx = this.compositor.codeCtx;
        this.compiledCanvasFn(c, ctx, c.width, c.height, t, window);
      } catch (err) {
        this.lastError = `Runtime Error: ${err.message}`;
      }
    } else if (this.isHtmlMode) {
      // Untuk mode HTML, kita coba sinkronkan canvas dari dalam iframe jika ada
      try {
        const iframeDoc = this.iframe.contentDocument || this.iframe.contentWindow?.document;
        if (iframeDoc) {
          const innerCanvas = iframeDoc.querySelector('canvas');
          if (innerCanvas && innerCanvas.width > 0 && innerCanvas.height > 0) {
            this.compositor.codeCtx.drawImage(innerCanvas, 0, 0, this.compositor.codeCanvas.width, this.compositor.codeCanvas.height);
          }
        }
      } catch {
        // Abaikan jika frame belum siap
      }
    }
  }

  dispose() {
    if (this.iframe && this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
    }
  }
}

/**
 * Pipeline Ekspor Video Kualitas Tinggi
 * Menggunakan WebCodecs + mp4-muxer untuk menghasilkan MP4 langsung di browser,
 * dengan fallback otomatis ke MediaRecorder (WebM) jika WebCodecs tidak tersedia.
 */
export async function exportVideo({
  compositor,
  sandbox,
  settings,
  resolution = '1080p',
  aspectRatio = '16:9',
  fps = 30,
  duration = 10,
  bitratePreset = 'standard',
  onProgress,
  signal
}) {
  const { width, height } = computeTargetDimensions(resolution, aspectRatio);
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const bitrate = BITRATE_PRESETS[bitratePreset] || BITRATE_PRESETS.standard;

  // Sesuaikan resolusi master compositor dengan target export
  compositor.resize(width, height);

  // Periksa dukungan WebCodecs VideoEncoder
  const supportsWebCodecs = typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window;

  let codec = 'avc1.4d002a'; // H.264 Main Profile Level 4.2
  let isCodecSupported = false;

  if (supportsWebCodecs) {
    try {
      const configCheck = await VideoEncoder.isConfigSupported({
        codec: 'avc1.4d002a',
        width,
        height,
        bitrate,
        framerate: fps
      });
      if (configCheck.supported) {
        codec = 'avc1.4d002a';
        isCodecSupported = true;
      } else {
        const baselineCheck = await VideoEncoder.isConfigSupported({
          codec: 'avc1.42001f',
          width,
          height,
          bitrate,
          framerate: fps
        });
        if (baselineCheck.supported) {
          codec = 'avc1.42001f';
          isCodecSupported = true;
        }
      }
    } catch {
      isCodecSupported = false;
    }
  }

  // --- JALUR UTAMA: WEBCODECS + MP4-MUXER ---
  if (supportsWebCodecs && isCodecSupported) {
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width,
        height
      },
      fastStart: 'in-memory'
    });

    let encoderError = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encoderError = e;
      }
    });

    videoEncoder.configure({
      codec,
      width,
      height,
      bitrate,
      framerate: fps
    });

    const startTime = performance.now();

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      if (signal?.aborted) {
        videoEncoder.close();
        throw new Error('Proses render dibatalkan oleh pengguna.');
      }

      if (encoderError) {
        throw encoderError;
      }

      const t = frameIndex / fps;

      // 1. Jalankan animasi kode pada detik t
      sandbox.renderStep(t);

      // 2. Render frame pada Three.js Compositor & HUD
      compositor.renderFrame(t, settings);

      // 3. Masukkan frame ke VideoEncoder
      const timestampMicros = Math.round((frameIndex / fps) * 1_000_000);
      const isKeyFrame = frameIndex % (fps * 2) === 0;

      const videoFrame = new VideoFrame(compositor.masterCanvas, {
        timestamp: timestampMicros
      });

      videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
      videoFrame.close();

      // Beri jeda kecil agar UI browser tetap responsif
      if (frameIndex % 5 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // Laporkan progress
      if (onProgress) {
        const elapsed = (performance.now() - startTime) / 1000;
        const framesDone = frameIndex + 1;
        const framesLeft = totalFrames - framesDone;
        const timeRemainingSec = Math.max(0, Math.round((elapsed / framesDone) * framesLeft));
        const percent = Math.min(100, Math.round((framesDone / totalFrames) * 100));

        onProgress({
          frame: framesDone,
          totalFrames,
          percent,
          timeRemainingSec
        });
      }
    }

    await videoEncoder.flush();
    muxer.finalize();

    const buffer = muxer.target.buffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);

    return {
      blob,
      url,
      format: 'mp4',
      mimeType: 'video/mp4',
      sizeMB,
      width,
      height,
      duration
    };
  }

  // --- JALUR CADANGAN: MEDIARECORDER (WEBM) ---
  return new Promise((resolve, reject) => {
    try {
      const stream = compositor.masterCanvas.captureStream(fps);
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitrate
      });

      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
        resolve({
          blob,
          url,
          format: 'webm',
          mimeType,
          sizeMB,
          width,
          height,
          duration
        });
      };

      recorder.onerror = (err) => reject(err);

      recorder.start();

      let frameIndex = 0;
      const startTime = performance.now();
      const intervalMs = 1000 / fps;

      const timer = setInterval(() => {
        if (signal?.aborted) {
          clearInterval(timer);
          recorder.stop();
          reject(new Error('Proses render dibatalkan oleh pengguna.'));
          return;
        }

        if (frameIndex >= totalFrames) {
          clearInterval(timer);
          recorder.stop();
          return;
        }

        const t = frameIndex / fps;
        sandbox.renderStep(t);
        compositor.renderFrame(t, settings);

        frameIndex++;

        if (onProgress) {
          const elapsed = (performance.now() - startTime) / 1000;
          const framesDone = frameIndex;
          const framesLeft = totalFrames - framesDone;
          const timeRemainingSec = Math.max(0, Math.round((elapsed / framesDone) * framesLeft));
          const percent = Math.min(100, Math.round((framesDone / totalFrames) * 100));

          onProgress({
            frame: framesDone,
            totalFrames,
            percent,
            timeRemainingSec
          });
        }
      }, intervalMs);
    } catch (err) {
      reject(err);
    }
  });
}
