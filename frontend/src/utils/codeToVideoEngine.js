/**
 * Kuro Studio - Code to Video Engine (True Full-Screen Cinematic + Deterministic 60fps)
 * Mesin Compositor Tiga Dimensi & Penuh Layar Sinematik, Virtual Clock Sandbox Runner,
 * Atmospheric FX (Awan Volumetrik & 4 Gaya Partikel),
 * serta Pipeline Ekspor Video Deterministik Bebas Crash (WebCodecs MP4 Multi-Codec + Fallback MediaRecorder).
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

  // Wajib genap kelipatan 2
  w = (w >> 1) << 1;
  h = (h >> 1) << 1;

  return { width: w, height: h };
}

export const BITRATE_PRESETS = {
  light: 4_000_000,     // 4 Mbps
  standard: 8_000_000,  // 8 Mbps
  high: 16_000_000,     // 16 Mbps
  ultra: 26_000_000     // 26 Mbps
};

// --- TEKSTUR PARTIKEL PROSEDURAL ---

function createBokehTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.7)');
  grad.addColorStop(0.8, 'rgba(255, 255, 255, 0.2)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function createStarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  ctx.fillStyle = 'rgba(255, 255, 255, 1)';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(32, 32, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.lineTo(32, 60);
  ctx.moveTo(4, 32);
  ctx.lineTo(60, 32);
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

function createSnowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.6)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

function createSparkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  const grad = ctx.createLinearGradient(32, 0, 32, 64);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.9)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(32, 32, 8, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

function createCloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);

  const puffs = [
    { x: 128, y: 128, r: 100 },
    { x: 90, y: 130, r: 75 },
    { x: 165, y: 130, r: 80 },
    { x: 110, y: 95, r: 70 },
    { x: 145, y: 95, r: 72 }
  ];

  puffs.forEach((p) => {
    const grad = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, p.r);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
    grad.addColorStop(0.8, 'rgba(255, 255, 255, 0.15)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Master Compositor (True Full-Screen Cinematic + Optional 3D Stage)
 */
export class CodeToVideoCompositor {
  constructor(containerCanvas, width = 1280, height = 720) {
    this.containerCanvas = containerCanvas;
    this.width = width;
    this.height = height;

    // Buffer internal hasil render kode pengguna
    this.codeCanvas = document.createElement('canvas');
    this.codeCanvas.width = width;
    this.codeCanvas.height = height;
    this.codeCtx = this.codeCanvas.getContext('2d', { alpha: true });

    // Overlay 2D untuk Tipografi HUD
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = width;
    this.hudCanvas.height = height;
    this.hudCtx = this.hudCanvas.getContext('2d', { alpha: true });

    // Master Output Canvas (dimensi piksel native eksak)
    this.masterCanvas = document.createElement('canvas');
    this.masterCanvas.width = width;
    this.masterCanvas.height = height;
    this.masterCtx = this.masterCanvas.getContext('2d', { alpha: false });

    // Three.js 3D Engine
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

    this.particleTextures = {
      dust: createBokehTexture(),
      stars: createStarTexture(),
      snow: createSnowTexture(),
      sparks: createSparkTexture()
    };
    this.cloudTexture = createCloudTexture();

    this.initBackgroundLayer();
    this.initCodePlane();
    this.initAtmosphericEffects();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;

    this.codeCanvas.width = width;
    this.codeCanvas.height = height;

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

    // Bingkai TV 3D Neobrutalist
    const frameGeo = new THREE.PlaneGeometry(3.3, 1.9);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.frameMesh = new THREE.Mesh(frameGeo, frameMat);
    this.frameMesh.position.z = -0.01;

    // Layar TV
    const planeGeo = new THREE.PlaneGeometry(3.2, 1.8);
    const planeMat = new THREE.MeshBasicMaterial({
      map: this.codeTexture,
      transparent: true
    });
    this.codeMesh = new THREE.Mesh(planeGeo, planeMat);

    this.codeGroup = new THREE.Group();
    this.codeGroup.add(this.frameMesh);
    this.codeGroup.add(this.codeMesh);
    this.scene.add(this.codeGroup);
  }

  initAtmosphericEffects() {
    // 1. Awan 3D
    this.cloudGroup = new THREE.Group();
    this.cloudPlanes = [];

    const cloudPuffs = [
      { x: -1.9, y: 0.9, z: -1.4, scale: 2.6, speed: 0.08 },
      { x: 1.8, y: -0.7, z: -0.9, scale: 2.8, speed: 0.06 },
      { x: -0.9, y: -1.1, z: 0.4, scale: 2.2, speed: 0.1 },
      { x: 1.3, y: 1.1, z: 0.7, scale: 2.5, speed: 0.07 }
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
      size: 0.15,
      map: this.particleTextures.sparks,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0x00f0ff
    });

    this.particlePoints = new THREE.Points(this.particleGeo, this.particleMat);
    this.scene.add(this.particlePoints);
  }

  updateScene(t, settings) {
    const {
      rotateX = 18,
      rotateY = -20,
      rotateZ = 0,
      zoom = 1.05,
      autoOrbit = false,
      motionSpeed = 1.0,
      clouds = false,
      cloudDensity = 0.35,
      cloudColor = '#211042',
      particles = false,
      particleStyle = 'sparks',
      particleCount = 120,
      particleColor = '#00f0ff'
    } = settings;

    if (this.particleTextures[particleStyle] && this.particleMat.map !== this.particleTextures[particleStyle]) {
      this.particleMat.map = this.particleTextures[particleStyle];
      this.particleMat.needsUpdate = true;
    }

    let rx = (rotateX * Math.PI) / 180;
    let ry = (rotateY * Math.PI) / 180;
    let rz = (rotateZ * Math.PI) / 180;
    let py = 0;

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

    const safeZoom = Math.max(0.4, Math.min(zoom || 1.0, 2.5));
    this.camera.position.z = 4.4 / safeZoom;

    // Update Awan
    this.cloudGroup.visible = Boolean(clouds && cloudDensity > 0);
    if (this.cloudGroup.visible) {
      const cColor = new THREE.Color(cloudColor || '#211042');
      this.cloudPlanes.forEach((plane) => {
        plane.material.opacity = cloudDensity * 0.75;
        plane.material.color = cColor;

        const u = plane.userData;
        const drift = (t * u.speed * (motionSpeed || 1.0)) % 8;
        plane.position.x = u.initialX + drift;
        if (plane.position.x > 4.2) plane.position.x -= 8.4;
        plane.position.y = u.initialY + Math.sin(t * 0.5 + u.z) * 0.12;
      });
    }

    // Update Partikel
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
          py -= (0.4 + vel.seed * 0.05) * spd * 0.02;
          px += Math.sin(t * 1.6 + vel.seed) * 0.008 * spd;
          if (py < -3.2) py = 3.2;
        } else if (particleStyle === 'sparks') {
          py += (0.8 + vel.seed * 0.1) * spd * 0.025;
          px += Math.sin(t * 2.8 + vel.seed) * 0.012 * spd;
          if (py > 3.2) py = -3.2;
        } else if (particleStyle === 'stars') {
          px += Math.sin(t * 0.3 + vel.seed) * 0.002;
          py += Math.cos(t * 0.3 + vel.seed) * 0.002;
        } else {
          px += Math.sin(t * 0.6 + vel.seed) * 0.005 * spd;
          py += Math.cos(t * 0.5 + vel.seed) * 0.005 * spd;
          pz += Math.sin(t * 0.4 + vel.seed) * 0.004 * spd;
        }

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

  renderHud(settings) {
    const {
      hudEnabled = false,
      hudTitle = '',
      hudSubtitle = '',
      hudPosition = 'bottom-left'
    } = settings;

    this.hudCtx.clearRect(0, 0, this.width, this.height);
    if (!hudEnabled || (!hudTitle && !hudSubtitle)) return;

    const ctx = this.hudCtx;
    ctx.save();

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
      x = 44;
      y = this.height - 100;
      align = 'left';
    }

    ctx.textAlign = align;

    const titleText = (hudTitle || '').toUpperCase();
    const subText = (hudSubtitle || '').toUpperCase();

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

    ctx.fillStyle = '#000000';
    ctx.fillRect(boxX + 4 * scaleFactor, y + 4 * scaleFactor, boxWidth, boxHeight);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(boxX, y, boxWidth, boxHeight);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5 * scaleFactor;
    ctx.strokeRect(boxX, y, boxWidth, boxHeight);

    ctx.fillStyle = '#ff0055';
    ctx.beginPath();
    ctx.arc(boxX + 16 * scaleFactor, y + 22 * scaleFactor, 5 * scaleFactor, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.font = `900 ${titleSize}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(titleText, boxX + 28 * scaleFactor, y + 28 * scaleFactor);

    ctx.fillStyle = '#444444';
    ctx.font = `700 ${subSize}px monospace`;
    ctx.fillText(subText, boxX + 28 * scaleFactor, y + 48 * scaleFactor);

    ctx.restore();
  }

  /**
   * Render satu frame komprehensif
   * Mendukung TRUE FULL-SCREEN CINEMATIC (stage3d: false) & OPTIONAL 3D TV STAGE (stage3d: true)
   */
  renderFrame(t, settings) {
    const is3dStage = Boolean(settings?.stage3d);

    if (!is3dStage) {
      // --- MODE FULLSCREEN SINEMATIK (DEFAULT: TANPA BINGKAI TV, TANPA BORDER, 100% PENUH) ---
      this.masterCtx.clearRect(0, 0, this.width, this.height);

      // 1. Gambar canvas kode pengguna langsung menutupi 100% kanvas
      this.masterCtx.drawImage(this.codeCanvas, 0, 0, this.width, this.height);

      // 2. Efek Partikel & Awan jika diaktifkan pengguna (komposabel di atas Full-Screen)
      if (settings?.clouds || settings?.particles) {
        // Matikan code group dan background quad di Three.js agar render partikel/awan transparan
        this.codeGroup.visible = false;
        this.bgMesh.visible = false;

        this.updateScene(t, settings);
        this.renderer.render(this.scene, this.camera);

        // Komposisikan lapisan atmosferik di atas video dengan blending halus
        this.masterCtx.save();
        this.masterCtx.drawImage(this.containerCanvas, 0, 0, this.width, this.height);
        this.masterCtx.restore();

        // Kembalikan visibilitas untuk mode 3D
        this.codeGroup.visible = true;
        this.bgMesh.visible = true;
      }

      // 3. Polesan Sinematik: Vignette Halus
      if (settings?.vignette) {
        const cx = this.width * 0.5;
        const cy = this.height * 0.5;
        const maxR = Math.max(this.width, this.height) * 0.65;
        const vigGrad = this.masterCtx.createRadialGradient(cx, cy, maxR * 0.45, cx, cy, maxR);
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vigGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
        this.masterCtx.fillStyle = vigGrad;
        this.masterCtx.fillRect(0, 0, this.width, this.height);
      }

      // 4. Polesan Sinematik: Color & Contrast Boost
      if (settings?.colorBoost) {
        this.masterCtx.save();
        this.masterCtx.globalCompositeOperation = 'soft-light';
        this.masterCtx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        this.masterCtx.fillRect(0, 0, this.width, this.height);
        this.masterCtx.restore();
      }

      // 5. Overlay Tipografi HUD
      if (settings?.hudEnabled) {
        this.renderHud(settings);
        this.masterCtx.drawImage(this.hudCanvas, 0, 0, this.width, this.height);
      }

      // Tampilkan hasil master ke container canvas pratinjau
      const cCtx = this.containerCanvas.getContext('2d');
      if (cCtx) {
        cCtx.clearRect(0, 0, this.width, this.height);
        cCtx.drawImage(this.masterCanvas, 0, 0, this.width, this.height);
      }
    } else {
      // --- MODE BINGKAI TV / PANGGUNG 3D (ON) ---
      this.codeGroup.visible = true;
      this.bgMesh.visible = true;

      this.updateBackground(settings);
      this.updateScene(t, settings);
      this.codeTexture.needsUpdate = true;

      // Render Three.js 3D TV Frame
      this.renderer.render(this.scene, this.camera);

      // Render HUD Tipografi
      this.renderHud(settings);

      // Komposisikan ke Master Output Canvas
      this.masterCtx.clearRect(0, 0, this.width, this.height);
      this.masterCtx.drawImage(this.containerCanvas, 0, 0, this.width, this.height);
      if (settings.hudEnabled) {
        this.masterCtx.drawImage(this.hudCanvas, 0, 0, this.width, this.height);
      }
    }
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
 * Dilengkapi Virtual Clock Controller Bridge untuk Render Deterministik 100% Smooth
 */
export class CodeSandboxRunner {
  constructor(compositor) {
    this.compositor = compositor;
    this.lastError = null;
    this.compiledCanvasFn = null;
    this.isHtmlMode = false;
    this.lastT = 0;
    this.renderStepResolver = null;

    // Siapkan Iframe sandbox
    this.iframe = document.createElement('iframe');
    this.iframe.style.position = 'fixed';
    this.iframe.style.top = '-9999px';
    this.iframe.style.left = '-9999px';
    this.iframe.style.width = '1280px';
    this.iframe.style.height = '720px';
    this.iframe.style.border = 'none';
    this.iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    document.body.appendChild(this.iframe);

    // Tangkap balasan frame deterministik dari iframe
    this.handleMessage = (e) => {
      const data = e.data;
      if (data && data.type === 'ctv-render-frame') {
        if (this.renderStepResolver) {
          this.renderStepResolver(data.bitmap || null);
          this.renderStepResolver = null;
        }
      }
    };
    window.addEventListener('message', this.handleMessage);
  }

  updateCode(code, type = 'auto') {
    this.lastError = null;
    this.code = code;

    const trimmed = (code || '').trim();
    const isHtml =
      type === 'html' ||
      trimmed.startsWith('<!DOCTYPE') ||
      trimmed.startsWith('<html') ||
      trimmed.includes('<style>') ||
      trimmed.includes('<body>') ||
      trimmed.includes('<div') ||
      trimmed.includes('<canvas');

    this.isHtmlMode = isHtml;

    if (!isHtml) {
      try {
        // Kompilasi JavaScript Canvas Script dengan variabel alias global
        this.compiledCanvasFn = new Function(
          'canvas',
          'ctx',
          'width',
          'height',
          'time',
          'dt',
          'frame',
          't',
          'window',
          `
          var c = canvas;
          ${code}
          `
        );
      } catch (err) {
        this.lastError = `Syntax Error: ${err.message}`;
        this.compiledCanvasFn = null;
      }
    } else {
      // Injeksi Virtual Clock Controller Bridge ke dalam Iframe
      const bridgeScript = `
        <script>
        (function() {
          var _virtualMode = false;
          var _virtualTime = 0;
          var _rafQueue = [];
          var _origRAF = window.requestAnimationFrame.bind(window);
          var _origPerfNow = performance.now.bind(performance);
          var _origDateNow = Date.now.bind(Date);

          window.requestAnimationFrame = function(cb) {
            if (!_virtualMode) return _origRAF(cb);
            _rafQueue.push(cb);
            return _rafQueue.length;
          };

          performance.now = function() {
            if (!_virtualMode) return _origPerfNow();
            return _virtualTime;
          };

          Date.now = function() {
            if (!_virtualMode) return _origDateNow();
            return _virtualTime;
          };

          window.addEventListener('message', async function(e) {
            var data = e.data;
            if (!data || !data.type) return;

            if (data.type === 'ctv-resize') {
              document.documentElement.style.width = data.width + 'px';
              document.documentElement.style.height = data.height + 'px';
              document.body.style.width = data.width + 'px';
              document.body.style.height = data.height + 'px';
              var c = document.querySelector('canvas');
              if (c) { c.width = data.width; c.height = data.height; }
              window.dispatchEvent(new Event('resize'));
            } else if (data.type === 'ctv-render-start') {
              _virtualMode = true;
              _virtualTime = 0;
              _rafQueue = [];
            } else if (data.type === 'ctv-render-stop') {
              _virtualMode = false;
              _rafQueue = [];
            } else if (data.type === 'ctv-render-step') {
              _virtualTime = data.timeMs;
              if (document.getAnimations) {
                try {
                  document.getAnimations().forEach(function(anim) {
                    anim.pause();
                    anim.currentTime = _virtualTime;
                  });
                } catch(err) {}
              }
              var cbs = _rafQueue.slice();
              _rafQueue = [];
              for (var i = 0; i < cbs.length; i++) {
                try { cbs[i](_virtualTime); } catch(err) {}
              }

              var canvas = document.querySelector('canvas');
              var bmp = null;
              if (canvas && canvas.width > 0 && canvas.height > 0) {
                try {
                  bmp = await createImageBitmap(canvas);
                } catch(err) {}
              }
              window.parent.postMessage({
                type: 'ctv-render-frame',
                frame: data.frame,
                bitmap: bmp
              }, '*', bmp ? [bmp] : []);
            }
          });
        })();
        </script>
      `;

      let finalHtml = code;
      if (code.includes('<head>')) {
        finalHtml = code.replace('<head>', `<head>${bridgeScript}`);
      } else {
        finalHtml = `${bridgeScript}${code}`;
      }
      this.iframe.srcdoc = finalHtml;
    }
  }

  /**
   * Langkah per-frame di Live Preview
   */
  renderStep(t) {
    if (this.lastError) return;

    const dt = Math.max(0.001, t - this.lastT);
    this.lastT = t;
    const frame = Math.round(t * 60);

    if (!this.isHtmlMode && this.compiledCanvasFn) {
      try {
        const c = this.compositor.codeCanvas;
        const ctx = this.compositor.codeCtx;

        if (typeof window !== 'undefined') {
          window.time = t;
          window.t = t;
          window.dt = dt;
          window.frame = frame;
          window.ctx = ctx;
          window.canvas = c;
          window.width = c.width;
          window.height = c.height;
        }

        this.compiledCanvasFn(c, ctx, c.width, c.height, t, dt, frame, t, window);
      } catch (err) {
        this.lastError = `Runtime Error: ${err.message}`;
      }
    } else if (this.isHtmlMode) {
      try {
        const iframeDoc = this.iframe.contentDocument || this.iframe.contentWindow?.document;
        if (iframeDoc) {
          const innerCanvas = iframeDoc.querySelector('canvas');
          if (innerCanvas && innerCanvas.width > 0 && innerCanvas.height > 0) {
            this.compositor.codeCtx.drawImage(
              innerCanvas,
              0,
              0,
              this.compositor.codeCanvas.width,
              this.compositor.codeCanvas.height
            );
          }
        }
      } catch {
        // Frame transien
      }
    }
  }

  /**
   * Langkah per-frame deterministik saat Render Video
   */
  async renderStepDeterministic(timeSec, frameIndex, dtSec, targetW, targetH) {
    if (this.lastError) return;

    if (!this.isHtmlMode && this.compiledCanvasFn) {
      // Pure JS Canvas langsung dieksekusi secara sinkron
      const c = this.compositor.codeCanvas;
      const ctx = this.compositor.codeCtx;
      c.width = targetW;
      c.height = targetH;

      if (typeof window !== 'undefined') {
        window.time = timeSec;
        window.t = timeSec;
        window.dt = dtSec;
        window.frame = frameIndex;
        window.ctx = ctx;
        window.canvas = c;
        window.width = targetW;
        window.height = targetH;
      }

      try {
        this.compiledCanvasFn(c, ctx, targetW, targetH, timeSec, dtSec, frameIndex, timeSec, window);
      } catch (err) {
        this.lastError = `Runtime Error: ${err.message}`;
      }
    } else if (this.isHtmlMode) {
      // Kirim sinyal render step deterministik ke iframe bridge
      const timeMs = timeSec * 1000;
      const win = this.iframe.contentWindow;
      if (!win) return;

      const bitmapPromise = new Promise((resolve) => {
        this.renderStepResolver = resolve;
        // Timeout pengaman 2 detik
        setTimeout(() => {
          if (this.renderStepResolver === resolve) {
            this.renderStepResolver = null;
            resolve(null);
          }
        }, 2000);
      });

      win.postMessage(
        {
          type: 'ctv-render-step',
          frame: frameIndex,
          timeMs,
          dtSec,
          width: targetW,
          height: targetH
        },
        '*'
      );

      const bitmap = await bitmapPromise;
      if (bitmap) {
        this.compositor.codeCtx.drawImage(bitmap, 0, 0, targetW, targetH);
        bitmap.close();
      } else {
        // Fallback: baca canvas DOM langsung
        try {
          const doc = this.iframe.contentDocument || this.iframe.contentWindow?.document;
          const c = doc?.querySelector('canvas');
          if (c && c.width > 0 && c.height > 0) {
            this.compositor.codeCtx.drawImage(c, 0, 0, targetW, targetH);
          }
        } catch {}
      }
    }
  }

  notifyRenderStart() {
    try {
      this.iframe.contentWindow?.postMessage({ type: 'ctv-render-start' }, '*');
    } catch {}
  }

  notifyRenderStop() {
    try {
      this.iframe.contentWindow?.postMessage({ type: 'ctv-render-stop' }, '*');
    } catch {}
  }

  dispose() {
    window.removeEventListener('message', this.handleMessage);
    if (this.iframe && this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
    }
  }
}

/**
 * Pipeline Ekspor Video Deterministik Bebas Crash & Super Smooth 60 FPS
 * Multi-Codec mp4-muxer (AVC -> VP9 -> AV1) + Fallback MediaRecorder
 */
export async function exportVideo({
  compositor,
  sandbox,
  settings,
  resolution = '1080p',
  aspectRatio = '16:9',
  fps = 30,
  duration = 10,
  bitratePreset = 'high',
  onProgress,
  signal
}) {
  const { width, height } = computeTargetDimensions(resolution, aspectRatio);
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const bitrate = BITRATE_PRESETS[bitratePreset] || BITRATE_PRESETS.high;

  // Sesuaikan resolusi master compositor dan buffer kode ke piksel eksak
  compositor.resize(width, height);

  const supportsWebCodecs = typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window;

  // Seleksi Multi-Codec Komprehensif (AVC / VP9 / AV1)
  const candidateCodecs = [
    // 1. AVC / H.264 (Default Industri)
    { codec: 'avc1.640033', muxerCodec: 'avc' },
    { codec: 'avc1.640032', muxerCodec: 'avc' },
    { codec: 'avc1.64002a', muxerCodec: 'avc' },
    { codec: 'avc1.4d002a', muxerCodec: 'avc' },
    { codec: 'avc1.420028', muxerCodec: 'avc' },
    { codec: 'avc1.42001f', muxerCodec: 'avc' },
    // 2. VP9 dalam MP4 (Solusi utama Firefox jika AVC ditolak)
    { codec: 'vp09.00.41.08', muxerCodec: 'vp9' },
    { codec: 'vp09.00.31.08', muxerCodec: 'vp9' },
    { codec: 'vp09.00.10.08', muxerCodec: 'vp9' },
    // 3. AV1 dalam MP4
    { codec: 'av01.0.08M.08', muxerCodec: 'av1' }
  ];

  let selectedCodecConfig = null;

  if (supportsWebCodecs) {
    for (const cand of candidateCodecs) {
      try {
        const res = await VideoEncoder.isConfigSupported({
          codec: cand.codec,
          width,
          height,
          bitrate,
          framerate: fps
        });
        if (res && res.supported) {
          selectedCodecConfig = cand;
          break;
        }
      } catch {
        // Coba codec berikutnya
      }
    }
  }

  // --- JALUR UTAMA: WEBCODECS + MP4-MUXER DETERMINISTIK ---
  if (supportsWebCodecs && selectedCodecConfig) {
    try {
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: selectedCodecConfig.muxerCodec,
          width,
          height
        },
        fastStart: 'in-memory'
      });

      let encoderError = null;

      // Sanitasi Metadata decoderConfig untuk mencegah error colorSpace is null
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          if (meta && meta.decoderConfig && typeof meta.decoderConfig === 'object') {
            const safeConfig = { ...meta.decoderConfig };
            if (!safeConfig.colorSpace) {
              safeConfig.colorSpace = {
                primaries: 'bt709',
                transfer: 'bt709',
                matrix: 'bt709',
                fullRange: false
              };
            }
            muxer.addVideoChunk(chunk, { ...meta, decoderConfig: safeConfig });
          } else {
            muxer.addVideoChunk(chunk);
          }
        },
        error: (e) => {
          encoderError = e;
        }
      });

      videoEncoder.configure({
        codec: selectedCodecConfig.codec,
        width,
        height,
        bitrate,
        framerate: fps
      });

      sandbox.notifyRenderStart();
      const startTime = performance.now();
      const spd = settings.motionSpeed || 1.0;
      const dtSec = (1 / fps) * spd;

      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        if (signal?.aborted) {
          sandbox.notifyRenderStop();
          videoEncoder.close();
          throw new Error('Proses render dibatalkan oleh pengguna.');
        }

        if (encoderError) {
          throw encoderError;
        }

        const t = (frameIndex / fps) * spd;

        // 1. Jalankan langkah deterministik Virtual Clock pada sandbox
        await sandbox.renderStepDeterministic(t, frameIndex, dtSec, width, height);

        // 2. Render komposisi Master Canvas
        compositor.renderFrame(t, settings);

        // 3. Masukkan frame ke VideoEncoder dengan timestamp eksak mikrodetik
        const timestampMicros = Math.round((frameIndex * 1_000_000) / fps);
        const frameDurationMicros = Math.round(1_000_000 / fps);
        const isKeyFrame = frameIndex % Math.max(1, Math.round(fps * 2)) === 0;

        const videoFrame = new VideoFrame(compositor.masterCanvas, {
          timestamp: timestampMicros,
          duration: frameDurationMicros
        });

        videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
        videoFrame.close();

        // Kontrol backpressure antrean memori encoder
        if (videoEncoder.encodeQueueSize >= 4) {
          await new Promise((resolve) => setTimeout(resolve, 4));
        }

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
      sandbox.notifyRenderStop();
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
    } catch (err) {
      sandbox.notifyRenderStop();
      if (signal?.aborted) throw err;
      console.warn('WebCodecs gagal, beralih ke fallback MediaRecorder:', err);
    }
  }

  // --- JALUR CADANGAN OTOMATIS: MEDIARECORDER ---
  return new Promise((resolve, reject) => {
    try {
      const stream = compositor.masterCanvas.captureStream(fps);

      let mimeType = 'video/mp4';
      let format = 'mp4';

      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp9';
        format = 'webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
        format = 'webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
        format = 'webm';
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
          format,
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
      const spd = settings.motionSpeed || 1.0;
      const dtSec = (1 / fps) * spd;

      const timer = setInterval(async () => {
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

        const t = (frameIndex / fps) * spd;
        await sandbox.renderStepDeterministic(t, frameIndex, dtSec, width, height);
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
