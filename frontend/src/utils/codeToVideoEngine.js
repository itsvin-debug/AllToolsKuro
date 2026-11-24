/**
 * Kuro Studio - Code to Video Engine (Butter-Smooth Direct GPU Live Preview + 100% Deterministic WebCodecs HD Renderer)
 * Mendukung multi-codec mp4-muxer (AVC / VP9 / AV1) + webm-muxer (VP9 / VP8) untuk durasi eksak bebas melar,
 * Fresh-Instance Isolated Renderer bebas waktu negatif / freeze, dan Direct GPU Sandbox Preview 60-144 FPS.
 */

import * as THREE from 'three';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from 'webm-muxer';

/**
 * Menghitung dimensi video (w & h) genap kelipatan 2 untuk kompatibilitas encoder
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

// --- PROSEDURAL TEKSTUR PARTIKEL & AWAN ---

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
 * Script Bridge Deterministik untuk Render Iframe Baru
 * Menginjeksi jam virtual, WebGL preserveDrawingBuffer, rafMap batching, dan timer synchronization
 */
export function buildRenderBridgeScript(width, height) {
  return `
  <script>
  (function() {
    var _virtualMs = 0;
    var _baseEpoch = Date.now();
    var _rafMap = new Map();
    var _rafIdCounter = 1;
    var _timerMap = new Map();
    var _timerIdCounter = 1;

    // 1. Force WebGL preserveDrawingBuffer & antialias pada getContext
    var _origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attributes) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        attributes = Object.assign({}, attributes, {
          preserveDrawingBuffer: true,
          antialias: true
        });
      }
      return _origGetContext.call(this, type, attributes);
    };

    // 2. Override Performance & Date Clock secara monoton
    performance.now = function() {
      return _virtualMs;
    };
    Date.now = function() {
      return Math.floor(_baseEpoch + _virtualMs);
    };

    // 3. Override requestAnimationFrame & cancelAnimationFrame
    window.requestAnimationFrame = function(cb) {
      var id = _rafIdCounter++;
      _rafMap.set(id, cb);
      return id;
    };
    window.cancelAnimationFrame = function(id) {
      _rafMap.delete(id);
    };

    // 4. Override setTimeout & setInterval berbasis Virtual Clock
    window.setTimeout = function(cb, delay) {
      var args = Array.prototype.slice.call(arguments, 2);
      var id = _timerIdCounter++;
      _timerMap.set(id, {
        cb: cb,
        triggerAt: _virtualMs + Math.max(0, delay || 0),
        isInterval: false,
        delay: 0,
        args: args
      });
      return id;
    };
    window.setInterval = function(cb, delay) {
      var args = Array.prototype.slice.call(arguments, 2);
      var id = _timerIdCounter++;
      var interval = Math.max(1, delay || 0);
      _timerMap.set(id, {
        cb: cb,
        triggerAt: _virtualMs + interval,
        isInterval: true,
        delay: interval,
        args: args
      });
      return id;
    };
    window.clearTimeout = function(id) {
      _timerMap.delete(id);
    };
    window.clearInterval = function(id) {
      _timerMap.delete(id);
    };

    // Helper pencari canvas utama
    function findCanvas() {
      var canvases = document.querySelectorAll('canvas');
      if (!canvases || canvases.length === 0) return null;
      if (canvases.length === 1) return canvases[0];
      var largest = null;
      var maxArea = -1;
      for (var i = 0; i < canvases.length; i++) {
        var c = canvases[i];
        var area = (c.width || c.clientWidth || 0) * (c.height || c.clientHeight || 0);
        if (area > maxArea) {
          maxArea = area;
          largest = c;
        }
      }
      return largest;
    }

    // Tangkap error runtime di dalam render iframe
    window.addEventListener('error', function(e) {
      try {
        window.parent.postMessage({
          type: 'ctv-error',
          error: 'Render Runtime: ' + (e.message || 'Unknown error')
        }, '*');
      } catch(err) {}
    });

    // Tunggu font & image siap
    async function notifyReady() {
      try {
        if (document.fonts && document.fonts.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise(function(r) { setTimeout(r, 2000); })
          ]);
        }
      } catch(e) {}
      window.parent.postMessage({ type: 'ctv-render-ready' }, '*');
    }

    if (document.readyState === 'complete') {
      notifyReady();
    } else {
      window.addEventListener('load', notifyReady);
      setTimeout(notifyReady, 2500);
    }

    // Listener message untuk frame stepping deterministik
    window.addEventListener('message', async function(e) {
      var data = e.data;
      if (!data || data.type !== 'ctv-render-step') return;

      _virtualMs = data.timeMs;
      var dtSec = data.dtSec || 0.0166;
      var timeSec = _virtualMs / 1000;
      var frame = data.frame || 0;

      // 1. Sinkronisasi CSS Animations & Transitions
      if (document.getAnimations) {
        try {
          document.getAnimations().forEach(function(anim) {
            try {
              anim.pause();
              anim.currentTime = _virtualMs;
            } catch(e) {}
          });
        } catch(e) {}
      }

      // 2. Eksekusi Timers yang jatuh tempo
      var timerEntries = Array.from(_timerMap.entries());
      for (var i = 0; i < timerEntries.length; i++) {
        var tid = timerEntries[i][0];
        var tObj = timerEntries[i][1];
        if (tObj.triggerAt <= _virtualMs) {
          try {
            if (typeof tObj.cb === 'function') {
              tObj.cb.apply(null, tObj.args);
            } else if (typeof tObj.cb === 'string') {
              (new Function(tObj.cb))();
            }
          } catch(err) {}
          if (tObj.isInterval) {
            tObj.triggerAt = _virtualMs + tObj.delay;
          } else {
            _timerMap.delete(tid);
          }
        }
      }

      // 3. Salin dan kosongkan rafMap SEBELUM memanggil callbacks
      var currentBatch = Array.from(_rafMap.entries());
      _rafMap.clear();
      for (var j = 0; j < currentBatch.length; j++) {
        try {
          currentBatch[j][1](_virtualMs);
        } catch(err) {}
      }

      // 4. Jika ada window.__userDraw (mode pure JS canvas)
      if (typeof window.__userDraw === 'function') {
        var targetC = findCanvas();
        if (targetC) {
          var targetCtx = targetC.getContext('2d');
          try {
            window.__userDraw(targetCtx, targetC, targetC.width, targetC.height, timeSec, timeSec, dtSec, frame);
          } catch(err) {}
        }
      }

      // Tunggu 1 microtask dan pastikan WebGL finish
      var finalCanvas = findCanvas();
      if (finalCanvas) {
        try {
          var gl = finalCanvas.getContext('webgl') || finalCanvas.getContext('webgl2');
          if (gl && typeof gl.finish === 'function') {
            gl.finish();
          }
        } catch(e) {}
      }

      await new Promise(function(r) { setTimeout(r, 0); });

      // Tangkap bitmap frame
      var bmp = null;
      if (finalCanvas && finalCanvas.width > 0 && finalCanvas.height > 0) {
        try {
          if (window.createImageBitmap) {
            bmp = await window.createImageBitmap(finalCanvas);
          }
        } catch(err) {}
      }

      window.parent.postMessage({
        type: 'ctv-render-frame',
        frame: data.frame,
        bitmap: bmp
      }, '*', bmp ? [bmp] : []);
    });
  })();
  </script>
  `;
}

/**
 * Script Bridge Ringan untuk Live Preview Iframe (Direct GPU)
 * Menjaga frame rate 60–144 FPS dan menerima sinyal pause/speed/restart instan tanpa reload
 */
export function buildLiveBridgeScript() {
  return `
  <script>
  (function() {
    var _speedMultiplier = 1.0;
    var _isPaused = false;
    var _pauseStartTime = 0;
    var _totalPausedMs = 0;
    var _restartOffset = 0;

    var _origPerfNow = performance.now.bind(performance);
    var _origDateNow = Date.now.bind(Date);

    // 1. Force WebGL preserveDrawingBuffer
    var _origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attributes) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        attributes = Object.assign({}, attributes, {
          preserveDrawingBuffer: true,
          antialias: true
        });
      }
      return _origGetContext.call(this, type, attributes);
    };

    // 2. Wrap clock untuk kecepatan gerak dan pause/resume
    performance.now = function() {
      if (_isPaused) {
        return (_pauseStartTime - _totalPausedMs - _restartOffset) * _speedMultiplier;
      }
      var now = _origPerfNow();
      return (now - _totalPausedMs - _restartOffset) * _speedMultiplier;
    };

    Date.now = function() {
      return Math.floor(_origDateNow() + (performance.now() - _origPerfNow()));
    };

    // 3. Tangkap runtime errors
    window.addEventListener('error', function(e) {
      try {
        window.parent.postMessage({
          type: 'ctv-error',
          error: 'Live Runtime: ' + (e.message || 'Unknown error')
        }, '*');
      } catch(err) {}
    });

    // 4. Tangkap kontrol pesan live
    window.addEventListener('message', function(e) {
      var data = e.data;
      if (!data || !data.type) return;

      if (data.type === 'ctv-live-speed') {
        _speedMultiplier = Number(data.speedMultiplier) || 1.0;
      } else if (data.type === 'ctv-live-pause') {
        if (!_isPaused) {
          _isPaused = true;
          _pauseStartTime = _origPerfNow();
        }
      } else if (data.type === 'ctv-live-resume') {
        if (_isPaused) {
          _isPaused = false;
          _totalPausedMs += (_origPerfNow() - _pauseStartTime);
        }
      } else if (data.type === 'ctv-live-restart') {
        _restartOffset = _origPerfNow();
        _totalPausedMs = 0;
        _isPaused = false;
      }
    });
  })();
  </script>
  `;
}

/**
 * Membangun HTML Sandbox baik untuk Live Preview maupun Deterministic Render
 */
export function buildSandboxHtml(rawCode = '', mode = 'live', options = {}) {
  const { width = 1280, height = 720, editorMode = 'hybrid' } = options;
  const bridgeScript = mode === 'render'
    ? buildRenderBridgeScript(width, height)
    : buildLiveBridgeScript();

  // Bersihkan typo umum CSS seperti style yang diawali tanda minus
  let cleanCode = (rawCode || '').trim();
  cleanCode = cleanCode.replace(/<style[^>]*>\s*-\s*\{/gi, '<style>\n* {');

  const isHtml =
    editorMode === 'hybrid' ||
    cleanCode.startsWith('<!DOCTYPE') ||
    cleanCode.startsWith('<html') ||
    cleanCode.includes('<style>') ||
    cleanCode.includes('<body>') ||
    cleanCode.includes('<canvas');

  if (!isHtml) {
    // Mode Pure JS Canvas: generate HTML dengan kanvas penuh
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
  ${bridgeScript}
</head>
<body>
  <canvas id="canvas" width="${width}" height="${height}"></canvas>
  <script>
    (function() {
      var canvas = document.getElementById('canvas');
      var ctx = canvas.getContext('2d');
      function resize() {
        canvas.width = window.innerWidth || ${width};
        canvas.height = window.innerHeight || ${height};
      }
      resize();
      window.addEventListener('resize', resize);

      function userDraw(ctx, canvas, width, height, time, t, dt, frame) {
        var c = canvas;
        ${cleanCode}
      }
      window.__userDraw = userDraw;

      var lastTime = performance.now();
      function loop(now) {
        var t = now * 0.001;
        var dt = Math.max(0.001, (now - lastTime) * 0.001);
        lastTime = now;
        var frame = Math.round(t * 60);
        userDraw(ctx, canvas, canvas.width, canvas.height, t, t, dt, frame);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    })();
  </script>
</body>
</html>`;
  }

  // Mode Hybrid / HTML Lengkap
  if (cleanCode.includes('<head>')) {
    return cleanCode.replace('<head>', `<head>${bridgeScript}`);
  } else if (cleanCode.includes('<html>')) {
    return cleanCode.replace('<html>', `<html><head>${bridgeScript}</head>`);
  } else {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${bridgeScript}</head><body>${cleanCode}</body></html>`;
  }
}

/**
 * Master Compositor untuk Efek Atmosferik (Awan & Partikel), Polesan Sinematik,
 * Tipografi HUD, dan Panggung 3D TV Opsional.
 */
export class CodeToVideoCompositor {
  constructor(containerCanvas, width = 1280, height = 720) {
    this.containerCanvas = containerCanvas;
    this.width = width;
    this.height = height;

    if (this.containerCanvas) {
      this.containerCanvas.width = width;
      this.containerCanvas.height = height;
      this.previewCtx = this.containerCanvas.getContext('2d', { alpha: false });
    } else {
      this.previewCtx = null;
    }

    // Master Output Canvas
    this.masterCanvas = document.createElement('canvas');
    this.masterCanvas.width = width;
    this.masterCanvas.height = height;
    this.masterCtx = this.masterCanvas.getContext('2d', { alpha: false });

    // Buffer internal untuk frame kode pengguna
    this.codeCanvas = document.createElement('canvas');
    this.codeCanvas.width = width;
    this.codeCanvas.height = height;
    this.codeCtx = this.codeCanvas.getContext('2d', { alpha: true });

    // Overlay 2D untuk Tipografi HUD
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = width;
    this.hudCanvas.height = height;
    this.hudCtx = this.hudCanvas.getContext('2d', { alpha: true });

    // Three.js di Offscreen Canvas Khusus
    this.offscreenThreeCanvas = document.createElement('canvas');
    this.offscreenThreeCanvas.width = width;
    this.offscreenThreeCanvas.height = height;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.offscreenThreeCanvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);

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

    this.latestBitmap = null;

    this.initBackgroundLayer();
    this.initCodePlane();
    this.initAtmosphericEffects();
  }

  updateBitmap(bmp) {
    if (this.latestBitmap && this.latestBitmap !== bmp) {
      try { this.latestBitmap.close(); } catch {}
    }
    this.latestBitmap = bmp;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;

    if (this.containerCanvas) {
      this.containerCanvas.width = width;
      this.containerCanvas.height = height;
    }

    this.masterCanvas.width = width;
    this.masterCanvas.height = height;

    this.codeCanvas.width = width;
    this.codeCanvas.height = height;

    this.hudCanvas.width = width;
    this.hudCanvas.height = height;

    this.offscreenThreeCanvas.width = width;
    this.offscreenThreeCanvas.height = height;

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
      const grad = this.bgCtx.createRadialGradient(256, 256, 10, 256, 256, 360);
      grad.addColorStop(0, bgColor1);
      grad.addColorStop(1, bgColor2);
      this.bgCtx.fillStyle = grad;
      this.bgCtx.fillRect(0, 0, 512, 512);
    }
    this.bgTexture.needsUpdate = true;
  }

  initCodePlane() {
    this.codeGroup = new THREE.Group();

    this.codeTexture = new THREE.CanvasTexture(this.codeCanvas);
    this.codeTexture.minFilter = THREE.LinearFilter;
    this.codeTexture.magFilter = THREE.LinearFilter;
    this.codeTexture.generateMipmaps = false;

    // Layar TV
    const screenGeo = new THREE.PlaneGeometry(3.6, 2.025);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.codeTexture,
      side: THREE.DoubleSide
    });
    this.screenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.codeGroup.add(this.screenMesh);

    // Bezel TV Neobrutalist
    const bezelGeo = new THREE.BoxGeometry(3.68, 2.105, 0.08);
    const bezelMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0f });
    this.bezelMesh = new THREE.Mesh(bezelGeo, bezelMat);
    this.bezelMesh.position.z = -0.045;
    this.codeGroup.add(this.bezelMesh);

    // Shadow Plane
    const shadowGeo = new THREE.PlaneGeometry(3.8, 2.2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.set(0.12, -0.12, -0.1);
    this.codeGroup.add(shadowMesh);

    this.scene.add(this.codeGroup);
  }

  initAtmosphericEffects() {
    // 1. Partikel Udara (Dust, Stars, Snow, Sparks)
    const count = 300;
    const pos = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const vels = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4;

      scales[i] = Math.random() * 0.4 + 0.2;

      vels[i * 3] = (Math.random() - 0.5) * 0.008;
      vels[i * 3 + 1] = (Math.random() - 0.5) * 0.008;
      vels[i * 3 + 2] = (Math.random() - 0.5) * 0.008;
    }

    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particleGeo.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
    this.particleVelocities = vels;

    this.particleMat = new THREE.PointsMaterial({
      size: 0.15,
      map: this.particleTextures.dust,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.particles = new THREE.Points(this.particleGeo, this.particleMat);
    this.scene.add(this.particles);

    // 2. Awan Volumetrik
    this.cloudGroup = new THREE.Group();
    const cloudGeo = new THREE.PlaneGeometry(3.5, 3.5);

    this.cloudMaterials = [];
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.cloudTexture,
        transparent: true,
        opacity: 0.35,
        blending: THREE.NormalBlending,
        depthWrite: false
      });
      this.cloudMaterials.push(mat);

      const mesh = new THREE.Mesh(cloudGeo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 2 - 0.5
      );
      mesh.rotation.z = Math.random() * Math.PI * 2;
      mesh.userData = {
        rotSpeed: (Math.random() - 0.5) * 0.002,
        driftX: (Math.random() - 0.5) * 0.003
      };
      this.cloudGroup.add(mesh);
    }
    this.scene.add(this.cloudGroup);
  }

  updateScene(t, settings) {
    const is3dStage = Boolean(settings?.stage3d);

    if (is3dStage) {
      const rx = ((settings?.rotateX ?? 18) * Math.PI) / 180;
      const ry = ((settings?.rotateY ?? -20) * Math.PI) / 180;
      const rz = ((settings?.rotateZ ?? 0) * Math.PI) / 180;

      let orbitX = 0;
      let orbitY = 0;
      if (settings?.autoOrbit) {
        orbitX = Math.sin(t * 0.8) * 0.04;
        orbitY = Math.cos(t * 0.6) * 0.06;
      }

      this.codeGroup.rotation.set(rx + orbitX, ry + orbitY, rz);
      this.codeGroup.position.set(0, Math.sin(t * 1.2) * 0.03, 0);

      const zoom = settings?.zoom ?? 1.05;
      this.camera.position.z = 4.4 / zoom;
    }

    // Update Partikel
    if (this.particles) {
      this.particles.visible = Boolean(settings?.particles);
      if (settings?.particles) {
        const style = settings?.particleStyle || 'dust';
        this.particleMat.map = this.particleTextures[style] || this.particleTextures.dust;
        this.particleMat.color.set(settings?.particleColor || '#ffffff');

        const posAttr = this.particleGeo.attributes.position;
        const positions = posAttr.array;
        const vels = this.particleVelocities;
        const count = Math.min(settings?.particleCount || 100, positions.length / 3);

        for (let i = 0; i < count; i++) {
          positions[i * 3] += vels[i * 3];
          positions[i * 3 + 1] += vels[i * 3 + 1];
          positions[i * 3 + 2] += vels[i * 3 + 2];

          if (positions[i * 3] > 4) positions[i * 3] = -4;
          if (positions[i * 3] < -4) positions[i * 3] = 4;
          if (positions[i * 3 + 1] > 2.5) positions[i * 3 + 1] = -2.5;
          if (positions[i * 3 + 1] < -2.5) positions[i * 3 + 1] = 2.5;
        }
        posAttr.needsUpdate = true;
      }
    }

    // Update Awan
    if (this.cloudGroup) {
      this.cloudGroup.visible = Boolean(settings?.clouds);
      if (settings?.clouds) {
        const density = settings?.cloudDensity ?? 0.25;
        const color = settings?.cloudColor || '#1d0f38';

        this.cloudMaterials.forEach((mat) => {
          mat.opacity = density * 0.7;
          mat.color.set(color);
        });

        this.cloudGroup.children.forEach((cloud) => {
          cloud.rotation.z += cloud.userData.rotSpeed;
          cloud.position.x += cloud.userData.driftX;
          if (cloud.position.x > 3.5) cloud.position.x = -3.5;
          if (cloud.position.x < -3.5) cloud.position.x = 3.5;
        });
      }
    }
  }

  renderHud(settings) {
    const ctx = this.hudCtx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (!settings?.hudEnabled) return;

    const scaleFactor = Math.min(this.width / 1280, this.height / 720);
    const titleText = (settings.hudTitle || 'UNTITLED MOTION').toUpperCase();
    const subText = (settings.hudSubtitle || 'KURO STUDIO DETERMINISTIC').toUpperCase();
    const pos = settings.hudPosition || 'bottom-left';

    ctx.save();

    const titleSize = Math.round(20 * scaleFactor);
    const subSize = Math.round(11 * scaleFactor);
    ctx.font = `900 ${titleSize}px monospace`;
    const titleWidth = ctx.measureText(titleText).width;
    ctx.font = `700 ${subSize}px monospace`;
    const subWidth = ctx.measureText(subText).width;

    const boxWidth = Math.max(titleWidth, subWidth) + 48 * scaleFactor;
    const boxHeight = 64 * scaleFactor;
    const pad = 32 * scaleFactor;

    let x = pad;
    let y = this.height - boxHeight - pad;

    switch (pos) {
      case 'bottom-center':
        x = (this.width - boxWidth) / 2;
        y = this.height - boxHeight - pad;
        break;
      case 'top-left':
        x = pad;
        y = pad;
        break;
      case 'top-center':
        x = (this.width - boxWidth) / 2;
        y = pad;
        break;
      default:
        x = pad;
        y = this.height - boxHeight - pad;
    }

    // Shadow & Box Neobrutalist
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 5 * scaleFactor, y + 5 * scaleFactor, boxWidth, boxHeight);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, boxWidth, boxHeight);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5 * scaleFactor;
    ctx.strokeRect(x, y, boxWidth, boxHeight);

    ctx.fillStyle = '#ff0055';
    ctx.beginPath();
    ctx.arc(x + 16 * scaleFactor, y + 22 * scaleFactor, 5 * scaleFactor, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.font = `900 ${titleSize}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(titleText, x + 28 * scaleFactor, y + 28 * scaleFactor);

    ctx.fillStyle = '#444444';
    ctx.font = `700 ${subSize}px monospace`;
    ctx.fillText(subText, x + 28 * scaleFactor, y + 48 * scaleFactor);

    ctx.restore();
  }

  /**
   * Render satu frame komprehensif ke masterCanvas
   * Mendukung TRUE FULL-SCREEN CINEMATIC (stage3d: false) & OPTIONAL 3D TV STAGE (stage3d: true)
   */
  renderFrame(t, settings = {}) {
    const is3dStage = Boolean(settings?.stage3d);
    const source = this.latestBitmap || this.codeCanvas;

    if (!is3dStage) {
      // --- MODE FULLSCREEN SINEMATIK (DEFAULT) ---
      this.masterCtx.clearRect(0, 0, this.width, this.height);

      if (source) {
        this.masterCtx.drawImage(source, 0, 0, this.width, this.height);
      }

      // Efek Awan & Partikel (di-render via offscreenThreeCanvas)
      if (settings?.clouds || settings?.particles) {
        this.codeGroup.visible = false;
        this.bgMesh.visible = false;

        this.updateScene(t, settings);
        this.renderer.render(this.scene, this.camera);

        this.masterCtx.save();
        this.masterCtx.drawImage(this.offscreenThreeCanvas, 0, 0, this.width, this.height);
        this.masterCtx.restore();

        this.codeGroup.visible = true;
        this.bgMesh.visible = true;
      }

      // Polesan Sinematik: Vignette
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

      // Polesan Sinematik: Color Boost
      if (settings?.colorBoost) {
        this.masterCtx.save();
        this.masterCtx.globalCompositeOperation = 'soft-light';
        this.masterCtx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        this.masterCtx.fillRect(0, 0, this.width, this.height);
        this.masterCtx.restore();
      }

      // Overlay Tipografi HUD
      if (settings?.hudEnabled) {
        this.renderHud(settings);
        this.masterCtx.drawImage(this.hudCanvas, 0, 0, this.width, this.height);
      }

      // Blit ke DOM Preview Canvas jika tersedia
      if (this.previewCtx) {
        this.previewCtx.clearRect(0, 0, this.width, this.height);
        this.previewCtx.drawImage(this.masterCanvas, 0, 0, this.width, this.height);
      }
    } else {
      // --- MODE BINGKAI TV / PANGGUNG 3D ---
      if (this.latestBitmap) {
        this.codeCtx.clearRect(0, 0, this.width, this.height);
        this.codeCtx.drawImage(this.latestBitmap, 0, 0, this.width, this.height);
      }
      this.codeTexture.needsUpdate = true;

      this.codeGroup.visible = true;
      this.bgMesh.visible = true;

      this.updateBackground(settings);
      this.updateScene(t, settings);

      this.renderer.render(this.scene, this.camera);
      this.renderHud(settings);

      this.masterCtx.clearRect(0, 0, this.width, this.height);
      this.masterCtx.drawImage(this.offscreenThreeCanvas, 0, 0, this.width, this.height);
      if (settings.hudEnabled) {
        this.masterCtx.drawImage(this.hudCanvas, 0, 0, this.width, this.height);
      }

      if (this.previewCtx) {
        this.previewCtx.clearRect(0, 0, this.width, this.height);
        this.previewCtx.drawImage(this.masterCanvas, 0, 0, this.width, this.height);
      }
    }
  }

  /**
   * Render HANYA efek overlay (Awan, Partikel, Vignette, Color Boost, HUD)
   * Digunakan oleh Transparent Overlay Canvas di atas Live Iframe
   */
  renderOverlayOnly(overlayCtx, width, height, t, settings) {
    if (!overlayCtx) return;

    overlayCtx.clearRect(0, 0, width, height);

    const hasAnyOverlay =
      settings?.clouds ||
      settings?.particles ||
      settings?.vignette ||
      settings?.colorBoost ||
      settings?.hudEnabled;

    if (!hasAnyOverlay) return;

    // Awan & Partikel via Three.js
    if (settings?.clouds || settings?.particles) {
      this.codeGroup.visible = false;
      this.bgMesh.visible = false;

      this.updateScene(t, settings);
      this.renderer.render(this.scene, this.camera);

      overlayCtx.drawImage(this.offscreenThreeCanvas, 0, 0, width, height);

      this.codeGroup.visible = true;
      this.bgMesh.visible = true;
    }

    // Vignette
    if (settings?.vignette) {
      const cx = width * 0.5;
      const cy = height * 0.5;
      const maxR = Math.max(width, height) * 0.65;
      const vigGrad = overlayCtx.createRadialGradient(cx, cy, maxR * 0.45, cx, cy, maxR);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
      overlayCtx.fillStyle = vigGrad;
      overlayCtx.fillRect(0, 0, width, height);
    }

    // Color Boost
    if (settings?.colorBoost) {
      overlayCtx.save();
      overlayCtx.globalCompositeOperation = 'soft-light';
      overlayCtx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      overlayCtx.fillRect(0, 0, width, height);
      overlayCtx.restore();
    }

    // HUD
    if (settings?.hudEnabled) {
      this.renderHud(settings);
      overlayCtx.drawImage(this.hudCanvas, 0, 0, width, height);
    }
  }

  dispose() {
    if (this.latestBitmap) {
      try { this.latestBitmap.close(); } catch {}
      this.latestBitmap = null;
    }
    this.renderer.dispose();
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.codeTexture.dispose();
    this.bgTexture.dispose();
  }
}

/**
 * Seleksi Encoder WebCodecs Terbaik Lintas Browser (Chrome, Edge, Safari, Firefox)
 * Menguji mp4-muxer (AVC -> VP9) DAN webm-muxer (VP9 -> VP8) secara deterministik
 */
export async function selectBestWebCodecsEncoder(width, height, fps, bitrateBps) {
  if (typeof window === 'undefined' || !('VideoEncoder' in window) || !('VideoFrame' in window)) {
    return null;
  }

  const accelModes = ['prefer-hardware', 'no-preference', 'prefer-software'];

  // Prioritas 1: MP4 H.264 / AVC (mp4-muxer)
  const avcCodecs = [
    'avc1.640033',
    'avc1.640032',
    'avc1.64002a',
    'avc1.4d002a',
    'avc1.420028',
    'avc1.42001f'
  ];
  for (const hw of accelModes) {
    for (const codec of avcCodecs) {
      try {
        const cfg = {
          codec,
          width,
          height,
          bitrate: bitrateBps,
          framerate: fps,
          hardwareAcceleration: hw,
          avc: { format: 'avc' },
          bitrateMode: 'variable',
          latencyMode: 'quality'
        };
        const res = await VideoEncoder.isConfigSupported(cfg);
        if (res && res.supported) {
          return {
            config: res.config || cfg,
            muxerType: 'mp4',
            muxerCodec: 'avc',
            format: 'mp4',
            mimeType: 'video/mp4'
          };
        }
      } catch {}
    }
  }

  // Prioritas 2: MP4 VP9 (mp4-muxer)
  const vp9Codecs = ['vp09.00.41.08', 'vp09.00.31.08', 'vp09.00.10.08'];
  for (const hw of accelModes) {
    for (const codec of vp9Codecs) {
      try {
        const cfg = {
          codec,
          width,
          height,
          bitrate: bitrateBps,
          framerate: fps,
          hardwareAcceleration: hw
        };
        const res = await VideoEncoder.isConfigSupported(cfg);
        if (res && res.supported) {
          return {
            config: res.config || cfg,
            muxerType: 'mp4',
            muxerCodec: 'vp9',
            format: 'mp4',
            mimeType: 'video/mp4'
          };
        }
      } catch {}
    }
  }

  // Prioritas 3: WebM VP9 / VP8 Deterministik (webm-muxer — penjamin 100% di Firefox!)
  for (const hw of accelModes) {
    for (const codec of vp9Codecs) {
      try {
        const cfg = {
          codec,
          width,
          height,
          bitrate: bitrateBps,
          framerate: fps,
          hardwareAcceleration: hw
        };
        const res = await VideoEncoder.isConfigSupported(cfg);
        if (res && res.supported) {
          return {
            config: res.config || cfg,
            muxerType: 'webm',
            muxerCodec: 'V_VP9',
            format: 'webm',
            mimeType: 'video/webm'
          };
        }
      } catch {}
    }

    // Uji VP8 WebM
    try {
      const cfg = {
        codec: 'vp8',
        width,
        height,
        bitrate: bitrateBps,
        framerate: fps,
        hardwareAcceleration: hw
      };
      const res = await VideoEncoder.isConfigSupported(cfg);
      if (res && res.supported) {
        return {
          config: res.config || cfg,
          muxerType: 'webm',
          muxerCodec: 'V_VP8',
          format: 'webm',
          mimeType: 'video/webm'
        };
      }
    } catch {}
  }

  return null;
}

/**
 * Helper pengirim step deterministik ke render iframe dengan timeout watchdog
 */
function stepRenderIframe(iframe, frameIndex, timeMs, dtSec, width, height, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let settled = false;
    const win = iframe?.contentWindow;
    if (!win) {
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        window.removeEventListener('message', onMsg);
        resolve(null);
      }
    }, timeoutMs);

    function onMsg(e) {
      const data = e.data;
      if (data && data.type === 'ctv-render-frame' && data.frame === frameIndex) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          window.removeEventListener('message', onMsg);
          resolve(data.bitmap || null);
        }
      }
    }

    window.addEventListener('message', onMsg);
    win.postMessage({
      type: 'ctv-render-step',
      frame: frameIndex,
      timeMs,
      dtSec,
      width,
      height
    }, '*');
  });
}

/**
 * Pipeline Ekspor Video Deterministik Bebas Crash & Super Smooth 60 FPS
 * Menggunakan Fresh-Instance Isolated Render Iframe dari t = 0.000s
 */
export async function exportVideo({
  compositor,
  code,
  editorMode = 'hybrid',
  settings = {},
  resolution = '1080p',
  aspectRatio = '16:9',
  fps = 60,
  duration = 10,
  bitratePreset = 'high',
  onProgress,
  signal
}) {
  const { width, height } = computeTargetDimensions(resolution, aspectRatio);
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const bitrate = BITRATE_PRESETS[bitratePreset] || BITRATE_PRESETS.high;

  // Sesuaikan resolusi master compositor ke piksel eksak
  compositor.resize(width, height);

  // Uji WebCodecs encoder
  const encoderSpec = await selectBestWebCodecsEncoder(width, height, fps, bitrate);

  // ── 1. SPAWN RENDER IFRAME BARU YANG 100% BERSIH DARI T = 0.000s ──
  const renderIframe = document.createElement('iframe');
  renderIframe.style.position = 'fixed';
  renderIframe.style.left = '0px';
  renderIframe.style.top = '0px';
  renderIframe.style.width = `${width}px`;
  renderIframe.style.height = `${height}px`;
  renderIframe.style.opacity = '0.001';
  renderIframe.style.pointerEvents = 'none';
  renderIframe.style.border = '0';
  renderIframe.style.zIndex = '-20';
  renderIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  document.body.appendChild(renderIframe);

  try {
    // Suntikkan kode & tunggu aset siap (ctv-render-ready)
    const readyPromise = new Promise((resolve) => {
      const handler = (e) => {
        if (e.data && e.data.type === 'ctv-render-ready') {
          window.removeEventListener('message', handler);
          resolve();
        }
      };
      window.addEventListener('message', handler);
      setTimeout(resolve, 2500); // Batas tunggu maksimal 2.5 detik
    });

    renderIframe.srcdoc = buildSandboxHtml(code, 'render', { width, height, editorMode });
    await readyPromise;

    // ── 2. JALUR UTAMA: DETERMINISTIC WEBCODECS (MP4-MUXER / WEBM-MUXER) ──
    if (encoderSpec) {
      let muxer = null;
      if (encoderSpec.muxerType === 'mp4') {
        muxer = new Mp4Muxer({
          target: new Mp4ArrayBufferTarget(),
          video: {
            codec: encoderSpec.muxerCodec,
            width,
            height
          },
          fastStart: 'in-memory'
        });
      } else {
        muxer = new WebmMuxer({
          target: new WebmArrayBufferTarget(),
          video: {
            codec: encoderSpec.muxerCodec,
            width,
            height
          }
        });
      }

      let encoderError = null;

      // Sanitasi Metadata decoderConfig (kebal error colorSpace is null)
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
        error: (err) => {
          encoderError = err;
        }
      });

      videoEncoder.configure(encoderSpec.config);

      const startTime = performance.now();
      const spd = settings.motionSpeed || 1.0;
      const dtSec = (1 / fps) * spd;
      let lastGoodBitmap = null;

      for (let i = 0; i < totalFrames; i++) {
        if (signal?.aborted) {
          videoEncoder.close();
          throw new Error('Proses render dibatalkan oleh pengguna.');
        }

        if (encoderError) {
          throw encoderError;
        }

        const simTime = (i / fps) * spd;
        const timeMs = simTime * 1000;

        // Step render iframe dengan 3-detik watchdog
        let frameBitmap = null;
        try {
          frameBitmap = await stepRenderIframe(renderIframe, i, timeMs, dtSec, width, height, 3000);
        } catch {
          // Frame transien
        }

        if (frameBitmap) {
          compositor.updateBitmap(frameBitmap);
          lastGoodBitmap = frameBitmap;
        } else if (lastGoodBitmap) {
          compositor.updateBitmap(lastGoodBitmap);
        }

        // Komposisikan frame ke master canvas
        compositor.renderFrame(simTime, settings);

        // Encode ke WebCodecs dengan timestamp eksak mikrodetik
        const timestampMicros = Math.round((i * 1_000_000) / fps);
        const frameDurationMicros = Math.round(1_000_000 / fps);
        const isKeyFrame = i % Math.max(1, Math.round(fps * 2)) === 0;

        const videoFrame = new VideoFrame(compositor.masterCanvas, {
          timestamp: timestampMicros,
          duration: frameDurationMicros
        });

        videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
        videoFrame.close();

        if (frameBitmap && frameBitmap !== lastGoodBitmap) {
          try { frameBitmap.close(); } catch {}
        }

        // Backpressure antrean encode
        while (videoEncoder.encodeQueueSize >= 4) {
          await new Promise((r) => setTimeout(r, 4));
        }

        // Yield ke UI tiap 2 frame agar progress bar mulus tanpa membekukan tab
        if (i % 2 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }

        if (onProgress) {
          const elapsed = (performance.now() - startTime) / 1000;
          const framesDone = i + 1;
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
      videoEncoder.close();
      muxer.finalize();

      const buffer = muxer.target.buffer;
      const blob = new Blob([buffer], { type: encoderSpec.mimeType });
      const url = URL.createObjectURL(blob);
      const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);

      return {
        blob,
        url,
        format: encoderSpec.format,
        mimeType: encoderSpec.mimeType,
        sizeMB,
        width,
        height,
        duration,
        engineName: `WebCodecs Deterministik (${encoderSpec.format.toUpperCase()} • ${fps} FPS Exact)`
      };
    }

    // ── 3. EMERGENCY FALLBACK: MEDIARECORDER REAL-TIME (HANYA JIKA VIDEOENCODER TIDAK DIDUKUNG) ──
    return await new Promise((resolve, reject) => {
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
            duration,
            engineName: 'Fallback MediaRecorder (Real-Time)'
          });
        };

        recorder.onerror = (err) => reject(err);
        recorder.start();

        const startTime = performance.now();
        const intervalMs = 1000 / fps;
        const totalMs = duration * 1000;
        const spd = settings.motionSpeed || 1.0;

        const timer = setInterval(() => {
          const elapsed = performance.now() - startTime;
          if (signal?.aborted) {
            clearInterval(timer);
            recorder.stop();
            reject(new Error('Proses render dibatalkan oleh pengguna.'));
            return;
          }

          if (elapsed >= totalMs) {
            clearInterval(timer);
            recorder.stop();
            return;
          }

          const simTime = (elapsed / 1000) * spd;
          compositor.renderFrame(simTime, settings);

          if (onProgress) {
            const percent = Math.min(100, Math.round((elapsed / totalMs) * 100));
            const timeRemainingSec = Math.max(0, Math.round((totalMs - elapsed) / 1000));
            onProgress({
              frame: Math.round((elapsed / 1000) * fps),
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
  } finally {
    // Hapus render iframe baru dari DOM agar RAM selalu bersih
    if (renderIframe && renderIframe.parentNode) {
      renderIframe.parentNode.removeChild(renderIframe);
    }
  }
}
