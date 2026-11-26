/**
 * Kuro Studio - Code to Video Engine (Butter-Smooth Direct GPU Live Preview + 100% Deterministic WebCodecs HD Renderer)
 * Mendukung multi-codec mp4-muxer (AVC / VP9 / AV1) + webm-muxer (VP9 / VP8) untuk durasi eksak bebas melar,
 * Fresh-Instance Isolated Renderer bebas waktu negatif / freeze, dan Direct GPU Sandbox Preview 60-144 FPS.
 */

import * as THREE from 'three';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from 'webm-muxer';
import {
  detectCodeLanguage as _detectCodeLanguage,
  compileUniversalCode as _compileUniversalCode
} from './universalCodeCompiler';

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

/**
 * Resolusi panggung virtual HD tetap untuk penskalaan Live Preview di desktop maupun layar HP
 */
export function getVirtualStageSize(aspectRatio = '16:9') {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1280, height: 720 };
    case '9:16':
      return { width: 720, height: 1280 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    case '21:9':
      return { width: 1680, height: 720 };
    default:
      return { width: 1280, height: 720 };
  }
}

export const BITRATE_PRESETS = {
  light: 4_000_000,     // 4 Mbps
  standard: 8_000_000,  // 8 Mbps
  high: 16_000_000,     // 16 Mbps
  ultra: 26_000_000     // 26 Mbps
};

export const STUDIO_FONT_PRESETS = {
  original: '',
  geometric: "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  'bold-display': "'Montserrat', 'Arial Black', system-ui, sans-serif",
  'editorial-serif': "'Georgia', 'Times New Roman', serif",
  'tech-mono': "'JetBrains Mono', ui-monospace, 'Cascadia Code', monospace"
};

export const STUDIO_VISUAL_STYLES = [
  { id: 'auto', name: 'Otomatis / Asli' },
  { id: 'neo-brutalist', name: 'Neo-Brutalist' },
  { id: 'glassmorphism', name: 'Glassmorphism 3D' },
  { id: 'warm-promo', name: 'Sinematik Promo' },
  { id: 'cyber-neon', name: 'Neon Cyber' },
  { id: 'editorial-minimal', name: 'Minimalis Terang' },
  { id: 'culinary-warm', name: 'Kuliner Hangat' },
  { id: 'quotes-editorial', name: 'Editorial Quotes' }
];

export const STUDIO_MOOD_PRESETS = [
  { id: 'auto', name: 'Asli / Otomatis', dot: '#94a3b8', bg1: '#f8fafc', bg2: '#e0f2fe', accent: '#38bdf8', text: '#ffffff', sat: 100, con: 100, bri: 100, hue: 0 },
  { id: 'pearl-sky', name: 'Mutiara & Biru Langit', dot: '#bae6fd', bg1: '#f8fafc', bg2: '#e0f2fe', accent: '#38bdf8', text: '#0f172a', sat: 105, con: 102, bri: 105, hue: 0 },
  { id: 'deep-indigo', name: 'Deep Indigo Neon', dot: '#4f46e5', bg1: '#07091e', bg2: '#1e1b4b', accent: '#38bdf8', text: '#f8fafc', sat: 120, con: 110, bri: 98, hue: -8 },
  { id: 'luxury-gold', name: 'Emas Mewah', dot: '#facc15', bg1: '#0b0b10', bg2: '#231807', accent: '#facc15', text: '#ffffff', sat: 122, con: 112, bri: 98, hue: 10 },
  { id: 'crimson-fire', name: 'Merah Mercon', dot: '#ef4444', bg1: '#150506', bg2: '#420a10', accent: '#ef4444', text: '#fff5f5', sat: 130, con: 114, bri: 100, hue: -12 },
  { id: 'emerald-clean', name: 'Emerald Clean', dot: '#34d399', bg1: '#04120e', bg2: '#073528', accent: '#34d399', text: '#ecfdf5', sat: 118, con: 108, bri: 102, hue: 28 },
  { id: 'sakura-pastel', name: 'Sakura Pastel', dot: '#fb7185', bg1: '#fff1f2', bg2: '#ffe4e6', accent: '#f43f5e', text: '#1f2937', sat: 110, con: 98, bri: 106, hue: -18 },
  { id: 'sharp-mono', name: 'Monokrom Tajam', dot: '#0f172a', bg1: '#ffffff', bg2: '#e2e8f0', accent: '#0f172a', text: '#09090b', sat: 0, con: 125, bri: 102, hue: 0 },
  { id: 'custom', name: 'Kustom Sendiri', dot: '#a855f7', bg1: '#f8fafc', bg2: '#e0f2fe', accent: '#38bdf8', text: '#ffffff', sat: 100, con: 100, bri: 100, hue: 0 }
];

export const DEFAULT_STUDIO_SETTINGS = {
  pureBypassMode: true,
  visualStyle: 'auto',
  mood: 'auto',
  usePromptHexColors: true,
  bgType: 'gradient',
  bgColor1: '#f8fafc',
  bgColor2: '#e0f2fe',
  tintColor: '#38bdf8',
  hudTextColor: '#ffffff',
  saturation: 100,
  contrast: 100,
  brightness: 100,
  hueRotate: 0,
  bgPattern: 'none',
  frameStyle: 'full',
  heroVisual: 'auto',
  cardStyle: 'auto',
  stage3d: false,
  clouds: false,
  cloudDensity: 0.25,
  cloudColor: '#ffffff',
  particles: false,
  particleStyle: 'petals-stars',
  particleCount: 100,
  particleColor: '#ffffff',
  vignette: false,
  softBloom: false,
  filmGrain: false,
  shimmerSweep: false,
  colorBoost: false,
  contrastBoost: 0,
  brightnessBoost: 0,
  fadeInOut: false,
  fontFamily: 'original',
  hudEnabled: false,
  hudTitle: 'KURO STUDIO',
  hudSubtitle: '60 FPS MOTION VIDEO',
  brandBadgeEnabled: false,
  brandBadgeText: 'KURO STUDIO',
  hudPosition: 'bottom-left',
  hudStyle: 'brutalist',
  hudAccentColor: '#ff0055',
  hudScale: 1.0,
  progressBarEnabled: false,
  textScale: 'normal',
  textAlign: 'left',
  showMetricCounters: true,
  motionSpeed: 1.0,
  transitionStyle: 'none',
  cameraMotion: 'static',
  rotateX: 18,
  rotateY: -20,
  rotateZ: 0,
  zoom: 1.05,
  autoOrbit: false,
  motionEasing: 'bouncy',
  autoDuration: false,
  watermarkEnabled: false,
  watermarkText: 'KURO STUDIO'
};

export function buildCssFilterString(settings = {}) {
  if (settings?.pureBypassMode) return 'none';
  const moodPreset = STUDIO_MOOD_PRESETS.find((m) => m.id === settings.mood);
  const baseSat = moodPreset ? moodPreset.sat : 100;
  const baseCon = moodPreset ? moodPreset.con : 100;
  const baseBri = moodPreset ? moodPreset.bri : 100;
  const baseHue = moodPreset ? moodPreset.hue : 0;

  const userSat = Number(settings.saturation ?? 100);
  const userCon = Number(settings.contrast ?? 100);
  const userBri = Number(settings.brightness ?? 100);
  const userHue = Number(settings.hueRotate ?? 0);

  const sat = Math.max(0, Math.round((baseSat * userSat) / 100));
  const con = Math.max(30, Math.round((baseCon * userCon) / 100 + (settings.colorBoost ? 8 : 0)));
  const bri = Math.max(30, Math.round((baseBri * userBri) / 100));
  const hue = Math.round(baseHue + userHue);

  if (sat === 100 && con === 100 && bri === 100 && hue === 0) return 'none';
  return `saturate(${sat}%) contrast(${con}%) brightness(${bri}%) hue-rotate(${hue}deg)`;
}

export function computeMotionAndFrameRect(width, height, t = 0, totalDuration = 12, settings = {}) {
  if (settings?.pureBypassMode) {
    return {
      rect: { x: 0, y: 0, w: width, h: height, radius: 0 },
      alpha: 1,
      scale: 1,
      tx: 0,
      ty: 0,
      wipeProgress: 1
    };
  }

  const frameStyle = settings.frameStyle || (settings.stage3d ? '3d-tv' : 'full');
  const pad = frameStyle === 'neo-brutalist'
    ? Math.round(Math.min(width, height) * 0.055)
    : frameStyle === 'glass'
    ? Math.round(Math.min(width, height) * 0.048)
    : 0;
  const radius = frameStyle === 'neo-brutalist' ? 10 : frameStyle === 'glass' ? 22 : 0;
  const rect = { x: pad, y: pad, w: Math.max(16, width - pad * 2), h: Math.max(16, height - pad * 2), radius };

  let alpha = 1;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let wipeProgress = 1;

  const cam = settings.cameraMotion || 'static';
  if (cam === 'ken-burns') {
    const prog = Math.min(1, t / Math.max(1, totalDuration));
    scale *= 1 + prog * 0.09;
    tx += Math.sin(prog * Math.PI) * width * 0.015;
    ty -= Math.sin(prog * Math.PI) * height * 0.012;
  } else if (cam === 'floating') {
    scale *= 1.035;
    tx += Math.sin(t * 1.1) * width * 0.01;
    ty += Math.cos(t * 0.85) * height * 0.01;
  }

  const tr = settings.fadeInOut && (!settings.transitionStyle || settings.transitionStyle === 'none')
    ? 'fade'
    : (settings.transitionStyle || 'none');

  if (tr !== 'none') {
    const transDur = 0.55;
    const enterProg = Math.min(1, Math.max(0, t / transDur));
    const exitRemain = Math.max(0, totalDuration - t);
    const exitProg = totalDuration > 1.5 && exitRemain < transDur ? Math.min(1, exitRemain / transDur) : 1;
    const gate = Math.min(enterProg, exitProg);

    if (tr === 'fade') {
      alpha *= gate;
    } else if (tr === 'zoom') {
      alpha *= gate;
      scale *= enterProg < 1 ? (1.14 - enterProg * 0.14) : (exitProg < 1 ? (1 - (1 - exitProg) * 0.08) : 1);
    } else if (tr === 'slide') {
      alpha *= gate;
      if (enterProg < 1) ty += (1 - Math.pow(enterProg, 2)) * height * 0.06;
      else if (exitProg < 1) ty -= (1 - exitProg) * height * 0.05;
    } else if (tr === 'wipe') {
      wipeProgress = gate;
    }
  }

  return { rect, alpha, scale, tx, ty, wipeProgress };
}

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
export function findPrimaryCanvas(doc) {
  if (!doc) return null;
  const canvases = doc.querySelectorAll('canvas');
  if (!canvases || canvases.length === 0) return null;

  let best = null;
  let maxScore = -1;
  for (let i = 0; i < canvases.length; i++) {
    const c = canvases[i];
    if (!c) continue;
    const style = doc.defaultView ? doc.defaultView.getComputedStyle(c) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) continue;
    const cw = c.width || c.clientWidth || 0;
    const ch = c.height || c.clientHeight || 0;
    if (cw <= 0 || ch <= 0) continue;
    const area = cw * ch;
    if (area > maxScore) {
      maxScore = area;
      best = c;
    }
  }
  return best;
}

function getSandboxSharedHelpersCode() {
  return `
    // Perkuat DOM/viewport guard sebelum kode pengguna berjalan di mobile maupun desktop
    try {
      var vpStyle = document.getElementById('ctv-viewport-guard');
      if (!vpStyle) {
        vpStyle = document.createElement('style');
        vpStyle.id = 'ctv-viewport-guard';
        vpStyle.textContent = 'html,body{min-width:100%;min-height:100%;margin:0;padding:0;}';
        (document.head || document.documentElement).appendChild(vpStyle);
      }
    } catch(_) {}

    // Polifill aman localStorage/sessionStorage untuk iframe sandbox terisolasi
    try { void window.localStorage; } catch(e) {
      var _memStore = {};
      var _mockStore = {
        getItem: function(k) { return Object.prototype.hasOwnProperty.call(_memStore, k) ? _memStore[k] : null; },
        setItem: function(k, v) { _memStore[k] = String(v); },
        removeItem: function(k) { delete _memStore[k]; },
        clear: function() { _memStore = {}; }
      };
      try { Object.defineProperty(window, 'localStorage', { value: _mockStore, configurable: true }); } catch(_) {}
      try { Object.defineProperty(window, 'sessionStorage', { value: _mockStore, configurable: true }); } catch(_) {}
    }

    // Pastikan konteks WebGL selalu mengaktifkan preserveDrawingBuffer & antialias
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

    function findCanvas() {
      var canvases = document.querySelectorAll('canvas');
      if (!canvases || canvases.length === 0) return null;
      var best = null;
      var maxArea = -1;
      for (var i = 0; i < canvases.length; i++) {
        var c = canvases[i];
        var st = window.getComputedStyle ? window.getComputedStyle(c) : null;
        if (st && (st.display === 'none' || st.visibility === 'hidden')) continue;
        var area = (c.width || c.clientWidth || 0) * (c.height || c.clientHeight || 0);
        if (area > 0 && area > maxArea) {
          maxArea = area;
          best = c;
        }
      }
      return best;
    }

    var INLINE_PROPS = [
      'display', 'position', 'top', 'right', 'bottom', 'left', 'inset',
      'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
      'margin', 'padding', 'box-sizing', 'flex', 'flex-direction', 'flex-wrap',
      'align-items', 'justify-content', 'gap', 'grid-template-columns', 'grid-template-rows',
      'background', 'background-color', 'background-image', 'background-size', 'background-position',
      'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
      'letter-spacing', 'text-align', 'text-transform', 'text-shadow', 'white-space',
      'border', 'border-radius', 'box-shadow', 'opacity', 'transform', 'transform-origin',
      'filter', 'backdrop-filter', 'clip-path', 'mix-blend-mode', 'overflow', 'z-index',
      'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset'
    ];

    function cloneWithComputedStyles(srcNode, dstNode) {
      if (!srcNode || !dstNode || srcNode.nodeType !== 1) return;
      try {
        var cs = window.getComputedStyle(srcNode);
        if (cs) {
          var styleStr = '';
          for (var p = 0; p < INLINE_PROPS.length; p++) {
            var prop = INLINE_PROPS[p];
            var val = cs.getPropertyValue(prop);
            if (val) styleStr += prop + ':' + val + ';';
          }
          if (styleStr) dstNode.setAttribute('style', styleStr);
        }
      } catch(e) {}
      var srcChildren = srcNode.children;
      var dstChildren = dstNode.children;
      for (var i = 0; i < srcChildren.length && i < dstChildren.length; i++) {
        cloneWithComputedStyles(srcChildren[i], dstChildren[i]);
      }
    }

    var _domCaptureCanvas = null;
    async function captureDomToBitmap(targetW, targetH) {
      try {
        if (!document.body) return null;
        if (!_domCaptureCanvas) _domCaptureCanvas = document.createElement('canvas');
        if (_domCaptureCanvas.width !== targetW || _domCaptureCanvas.height !== targetH) {
          _domCaptureCanvas.width = targetW;
          _domCaptureCanvas.height = targetH;
        }
        var dctx = _domCaptureCanvas.getContext('2d');
        var bodyStyle = window.getComputedStyle(document.body);
        var htmlStyle = window.getComputedStyle(document.documentElement);
        var bgCol = (bodyStyle && bodyStyle.backgroundColor && bodyStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && bodyStyle.backgroundColor !== 'transparent')
          ? bodyStyle.backgroundColor
          : ((htmlStyle && htmlStyle.backgroundColor && htmlStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && htmlStyle.backgroundColor !== 'transparent') ? htmlStyle.backgroundColor : '#09090b');

        var cloneBody = document.body.cloneNode(true);
        var scripts = cloneBody.querySelectorAll('script');
        for (var s = scripts.length - 1; s >= 0; s--) {
          if (scripts[s].parentNode) scripts[s].parentNode.removeChild(scripts[s]);
        }
        cloneWithComputedStyles(document.body, cloneBody);
        cloneBody.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        var bodyCssText = cloneBody.getAttribute('style') || '';
        cloneBody.setAttribute('style', bodyCssText + ';margin:0;width:' + targetW + 'px;height:' + targetH + 'px;overflow:hidden;');

        var headStyles = '';
        var styleEls = document.querySelectorAll('style');
        for (var stIdx = 0; stIdx < styleEls.length; stIdx++) {
          headStyles += styleEls[stIdx].textContent || '';
        }
        var styleDef = headStyles ? ('<style>' + headStyles.replace(/<\\/style>/gi, '') + '</style>') : '';

        var serialized = new XMLSerializer().serializeToString(cloneBody);
        var svgDoc = '<svg xmlns="http://www.w3.org/2000/svg" width="' + targetW + '" height="' + targetH + '">' +
          '<defs>' + styleDef + '</defs>' +
          '<foreignObject x="0" y="0" width="100%" height="100%">' + serialized + '</foreignObject></svg>';
        var dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgDoc);

        var img = new Image();
        img.width = targetW;
        img.height = targetH;
        await new Promise(function(resolve) {
          img.onload = resolve;
          img.onerror = resolve;
          img.src = dataUrl;
          if (img.decode) img.decode().then(resolve).catch(resolve);
        });

        dctx.fillStyle = bgCol;
        dctx.fillRect(0, 0, targetW, targetH);
        if (img.complete && img.naturalWidth > 0) {
          dctx.drawImage(img, 0, 0, targetW, targetH);
        }
        return window.createImageBitmap ? await window.createImageBitmap(_domCaptureCanvas) : null;
      } catch(err) {
        return null;
      }
    }
  `;
}

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

    ${getSandboxSharedHelpersCode()}

    // Override Performance & Date Clock secara monoton
    performance.now = function() {
      return _virtualMs;
    };
    Date.now = function() {
      return Math.floor(_baseEpoch + _virtualMs);
    };

    // Override requestAnimationFrame & cancelAnimationFrame
    window.requestAnimationFrame = function(cb) {
      var id = _rafIdCounter++;
      _rafMap.set(id, cb);
      return id;
    };
    window.cancelAnimationFrame = function(id) {
      _rafMap.delete(id);
    };

    // Override setTimeout & setInterval berbasis Virtual Clock
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

    window.addEventListener('error', function(e) {
      try {
        var loc = e.lineno ? (' (baris ' + e.lineno + ')') : '';
        window.parent.postMessage({
          type: 'ctv-error',
          error: 'Render Runtime' + loc + ': ' + (e.message || 'Unknown error')
        }, '*');
      } catch(err) {}
    });
    window.addEventListener('unhandledrejection', function(e) {
      try {
        var msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason || 'Promise rejected');
        window.parent.postMessage({
          type: 'ctv-error',
          error: 'Render Async: ' + msg
        }, '*');
      } catch(err) {}
    });

    // Tunggu window load, font, dan gambar eksternal hingga maksimal 6 detik
    var _readySent = false;
    async function notifyReady() {
      if (_readySent) return;
      _readySent = true;
      try {
        var waits = [];
        if (document.fonts && document.fonts.ready) {
          waits.push(document.fonts.ready);
        }
        var imgs = Array.from(document.images || []);
        for (var k = 0; k < imgs.length; k++) {
          if (!imgs[k].complete) {
            waits.push(new Promise(function(res) {
              imgs[k].addEventListener('load', res, { once: true });
              imgs[k].addEventListener('error', res, { once: true });
            }));
          } else if (imgs[k].decode) {
            waits.push(imgs[k].decode().catch(function() {}));
          }
        }
        if (waits.length > 0) {
          await Promise.race([
            Promise.all(waits),
            new Promise(function(r) { setTimeout(r, 5500); })
          ]);
        }
      } catch(e) {}
      window.parent.postMessage({ type: 'ctv-render-ready' }, '*');
    }

    if (document.readyState === 'complete') {
      notifyReady();
    } else {
      window.addEventListener('load', notifyReady);
      setTimeout(notifyReady, 5800);
    }

    // Listener message untuk frame stepping deterministik
    window.addEventListener('message', async function(e) {
      var data = e.data;
      if (!data || data.type !== 'ctv-render-step') return;

      _virtualMs = data.timeMs;
      var dtSec = data.dtSec || 0.0166;
      var timeSec = _virtualMs / 1000;
      var frame = data.frame || 0;

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

      var currentBatch = Array.from(_rafMap.entries());
      _rafMap.clear();
      for (var j = 0; j < currentBatch.length; j++) {
        try {
          currentBatch[j][1](_virtualMs);
        } catch(err) {}
      }

      if (typeof window.__userDraw === 'function') {
        var targetC = findCanvas();
        if (targetC) {
          var targetCtx = targetC.getContext('2d');
          try {
            window.__userDraw(targetCtx, targetC, targetC.width, targetC.height, timeSec, timeSec, dtSec, frame);
          } catch(err) {}
        }
      }

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

      var bmp = null;
      if (finalCanvas && finalCanvas.width > 0 && finalCanvas.height > 0) {
        try {
          if (window.createImageBitmap) {
            bmp = await window.createImageBitmap(finalCanvas);
          }
        } catch(err) {}
      } else {
        bmp = await captureDomToBitmap(data.width || ${width}, data.height || ${height});
      }

      window.parent.postMessage({
        type: 'ctv-render-frame',
        frame: data.frame,
        bitmap: bmp
      }, '*', bmp ? [bmp] : []);
    });
  })();
  ${'<'}/script>
  `;
}

/**
 * Script Bridge Non-Invasif untuk Live Preview Iframe (Native Direct GPU)
 * Mode normal (speed === 1 & tidak pause) membiarkan requestAnimationFrame,
 * performance.now, dan Date.now berjalan 100% native milik GPU browser.
 */
export function buildLiveBridgeScript(virtualW = 1280, virtualH = 720) {
  const safeW = Math.max(320, Number(virtualW) || 1280);
  const safeH = Math.max(240, Number(virtualH) || 720);
  return `
  <style id="ctv-viewport-guard">html,body{min-width:100%;min-height:100%;}</style>
  <script>
  (function() {
    window.__CTV_VIRTUAL_W__ = ${safeW};
    window.__CTV_VIRTUAL_H__ = ${safeH};

    var _speedMultiplier = 1.0;
    var _isPaused = false;

    var _origPerfNow = performance.now.bind(performance);
    var _origDateNow = Date.now.bind(Date);
    var _origRaf = window.requestAnimationFrame.bind(window);
    var _origCaf = window.cancelAnimationFrame.bind(window);

    var _virtualOffsetReady = false;
    var _liveVirtualMs = 16.67;
    var _lastPumpRealMs = _origPerfNow();
    var _liveRafQueue = [];
    var _liveRafCanceled = new Set();
    var _liveRafId = 1;
    var _livePumpScheduled = false;

    ${getSandboxSharedHelpersCode()}

    // Jamin window.innerWidth/Height & clientWidth/Height tidak pernah bernilai 0 saat bootstrap di HP
    try {
      var origInnerWDesc = Object.getOwnPropertyDescriptor(window, 'innerWidth');
      var origInnerHDesc = Object.getOwnPropertyDescriptor(window, 'innerHeight');
      if (origInnerWDesc && origInnerWDesc.get && origInnerWDesc.configurable) {
        Object.defineProperty(window, 'innerWidth', {
          configurable: true,
          get: function() {
            var val = origInnerWDesc.get.call(window);
            return val > 0 ? val : window.__CTV_VIRTUAL_W__;
          }
        });
      }
      if (origInnerHDesc && origInnerHDesc.get && origInnerHDesc.configurable) {
        Object.defineProperty(window, 'innerHeight', {
          configurable: true,
          get: function() {
            var val = origInnerHDesc.get.call(window);
            return val > 0 ? val : window.__CTV_VIRTUAL_H__;
          }
        });
      }
      var elProto = typeof Element !== 'undefined' ? Element.prototype : null;
      if (elProto) {
        var origClientW = Object.getOwnPropertyDescriptor(elProto, 'clientWidth');
        var origClientH = Object.getOwnPropertyDescriptor(elProto, 'clientHeight');
        if (origClientW && origClientW.get && origClientW.configurable) {
          Object.defineProperty(document.documentElement, 'clientWidth', {
            configurable: true,
            get: function() {
              var val = origClientW.get.call(document.documentElement);
              return val > 0 ? val : window.__CTV_VIRTUAL_W__;
            }
          });
        }
        if (origClientH && origClientH.get && origClientH.configurable) {
          Object.defineProperty(document.documentElement, 'clientHeight', {
            configurable: true,
            get: function() {
              var val = origClientH.get.call(document.documentElement);
              return val > 0 ? val : window.__CTV_VIRTUAL_H__;
            }
          });
        }
      }
    } catch(_) {}

    function dispatchSafeResize() {
      try {
        window.dispatchEvent(new Event('resize'));
      } catch(_) {}
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        dispatchSafeResize();
        setTimeout(dispatchSafeResize, 50);
        setTimeout(dispatchSafeResize, 200);
      });
    } else {
      setTimeout(dispatchSafeResize, 0);
      setTimeout(dispatchSafeResize, 50);
      setTimeout(dispatchSafeResize, 200);
    }
    window.addEventListener('load', function() {
      dispatchSafeResize();
      setTimeout(dispatchSafeResize, 50);
      setTimeout(dispatchSafeResize, 200);
    });

    function pumpVirtualRaf() {
      _livePumpScheduled = false;
      var realNow = _origPerfNow();
      var rawDelta = realNow - _lastPumpRealMs;
      var realDelta = (Number.isFinite(rawDelta) && rawDelta >= 0) ? Math.min(100, rawDelta) : 16.67;
      _lastPumpRealMs = realNow;

      if (!_isPaused) {
        var nextMs = _liveVirtualMs + realDelta * _speedMultiplier;
        _liveVirtualMs = (Number.isFinite(nextMs) && nextMs >= 0.016) ? nextMs : (_liveVirtualMs + 16.67);
      }

      if (_liveRafQueue.length > 0) {
        var safeStamp = (Number.isFinite(_liveVirtualMs) && _liveVirtualMs >= 0.016) ? _liveVirtualMs : 16.67;
        var batch = _liveRafQueue.splice(0, _liveRafQueue.length);
        for (var i = 0; i < batch.length; i++) {
          var entry = batch[i];
          if (_liveRafCanceled.has(entry.id)) {
            _liveRafCanceled.delete(entry.id);
            continue;
          }
          try {
            entry.cb(safeStamp);
          } catch(err) {
            try {
              window.parent.postMessage({
                type: 'ctv-error',
                error: 'Live Runtime: ' + (err && err.message ? err.message : String(err)),
                message: err && err.message ? err.message : String(err)
              }, '*');
            } catch(_) {}
          }
        }
      }

      if (_liveRafQueue.length > 0 && !_livePumpScheduled && (_isPaused || _speedMultiplier !== 1.0)) {
        _livePumpScheduled = true;
        _origRaf(pumpVirtualRaf);
      }
    }

    function syncClockMode() {
      var useVirtual = _isPaused || _speedMultiplier !== 1.0;
      if (!useVirtual) {
        performance.now = _origPerfNow;
        Date.now = _origDateNow;
        window.requestAnimationFrame = _origRaf;
        window.cancelAnimationFrame = _origCaf;
        // Kosongkan callback tertunda ke rAF native agar loop terus mengalir
        if (_liveRafQueue.length > 0) {
          var pending = _liveRafQueue.splice(0, _liveRafQueue.length);
          for (var i = 0; i < pending.length; i++) {
            if (!_liveRafCanceled.has(pending[i].id)) {
              _origRaf(pending[i].cb);
            }
          }
          _liveRafCanceled.clear();
        }
        return;
      }

      if (!_virtualOffsetReady) {
        _liveVirtualMs = _origPerfNow();
        _lastPumpRealMs = _origPerfNow();
        _virtualOffsetReady = true;
      }

      performance.now = function() {
        return _liveVirtualMs;
      };
      Date.now = function() {
        return Math.floor(_origDateNow() + (_liveVirtualMs - _origPerfNow()));
      };
      window.requestAnimationFrame = function(cb) {
        var id = _liveRafId++;
        if (typeof cb === 'function') {
          _liveRafQueue.push({ id: id, cb: cb });
          if (!_livePumpScheduled) {
            _livePumpScheduled = true;
            _origRaf(pumpVirtualRaf);
          }
        }
        return id;
      };
      window.cancelAnimationFrame = function(id) {
        _liveRafCanceled.add(id);
      };
    }

    window.addEventListener('error', function(e) {
      try {
        var loc = e.lineno ? (' (baris ' + e.lineno + ')') : '';
        var errText = 'Live Runtime' + loc + ': ' + (e.message || 'Unknown error');
        window.parent.postMessage({
          type: 'ctv-error',
          error: errText,
          message: errText
        }, '*');
      } catch(err) {}
    });
    window.addEventListener('unhandledrejection', function(e) {
      try {
        var msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason || 'Promise rejected');
        var errText = 'Live Async: ' + msg;
        window.parent.postMessage({
          type: 'ctv-error',
          error: errText,
          message: errText
        }, '*');
      } catch(err) {}
    });

    window.addEventListener('message', async function(e) {
      var data = e.data;
      if (!data || !data.type) return;

      if (data.type === 'ctv-force-resize') {
        if (data.width > 0) window.__CTV_VIRTUAL_W__ = data.width;
        if (data.height > 0) window.__CTV_VIRTUAL_H__ = data.height;
        dispatchSafeResize();
      } else if (data.type === 'ctv-live-speed' || data.type === 'ctv-speed') {
        _speedMultiplier = Number(data.speedMultiplier) || 1.0;
        syncClockMode();
        if (document.getAnimations) {
          try {
            document.getAnimations().forEach(function(a) { a.playbackRate = _speedMultiplier; });
          } catch(_) {}
        }
      } else if (data.type === 'ctv-live-pause' || data.type === 'ctv-pause') {
        _isPaused = true;
        syncClockMode();
        if (document.getAnimations) {
          try {
            document.getAnimations().forEach(function(a) { a.pause(); });
          } catch(_) {}
        }
      } else if (data.type === 'ctv-live-resume' || data.type === 'ctv-resume') {
        _isPaused = false;
        _lastPumpRealMs = _origPerfNow();
        syncClockMode();
        if (document.getAnimations) {
          try {
            document.getAnimations().forEach(function(a) { a.play(); });
          } catch(_) {}
        }
      } else if (data.type === 'ctv-live-restart') {
        _liveVirtualMs = 0.016;
        _lastPumpRealMs = _origPerfNow();
        _isPaused = false;
        syncClockMode();
        if (document.getAnimations) {
          try {
            document.getAnimations().forEach(function(a) { a.currentTime = 0; a.play(); });
          } catch(_) {}
        }
      } else if (data.type === 'ctv-live-font') {
        var styleId = 'ctv-font-override';
        var existingStyle = document.getElementById(styleId);
        var cleanFont = data.fontCss ? String(data.fontCss).replace(/[<>{}]/g, '') : '';
        if (!cleanFont) {
          if (existingStyle && existingStyle.parentNode) existingStyle.parentNode.removeChild(existingStyle);
        } else {
          if (!existingStyle) {
            existingStyle = document.createElement('style');
            existingStyle.id = styleId;
            (document.head || document.documentElement).appendChild(existingStyle);
          }
          existingStyle.textContent = 'html,body,h1,h2,h3,h4,p,span,div,button,a{font-family:' + cleanFont + ' !important;}';
        }
      } else if (data.type === 'ctv-live-capture') {
        var targetC = findCanvas();
        var bmp = null;
        var dataUrl = null;
        if (targetC && targetC.width > 0 && targetC.height > 0) {
          if (window.createImageBitmap) {
            try {
              bmp = await window.createImageBitmap(targetC);
            } catch(_) {
              bmp = null;
            }
          }
          if (!bmp && typeof targetC.toDataURL === 'function') {
            try {
              dataUrl = targetC.toDataURL('image/jpeg', 0.85);
            } catch(_) {
              dataUrl = null;
            }
          }
        } else {
          bmp = await captureDomToBitmap(data.width || window.__CTV_VIRTUAL_W__, data.height || window.__CTV_VIRTUAL_H__);
          if (!bmp && _domCaptureCanvas && typeof _domCaptureCanvas.toDataURL === 'function') {
            try {
              dataUrl = _domCaptureCanvas.toDataURL('image/jpeg', 0.85);
            } catch(_) {
              dataUrl = null;
            }
          }
        }
        window.parent.postMessage({ type: 'ctv-live-frame', bitmap: bmp, dataUrl: dataUrl }, '*', bmp ? [bmp] : []);
      }
    });
  })();
  ${'<'}/script>
  `;
}

export function detectCodeLanguage(rawInput = '') {
  return _detectCodeLanguage(rawInput);
}

export function compileUniversalCode(rawInput = '', mode = 'live', options = {}) {
  return _compileUniversalCode(rawInput, mode, {
    ...options,
    buildLiveBridge: (w, h) => buildLiveBridgeScript(w ?? options.width ?? 1280, h ?? options.height ?? 720),
    buildRenderBridge: buildRenderBridgeScript
  });
}

export function buildSandboxHtml(rawCode = '', mode = 'live', options = {}) {
  return compileUniversalCode(rawCode, mode, options);
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
    this.hasReceivedFrame = false;
    this.waitingSinceMs = 0;
    this._imageLoadSeq = 0;
    this._loadingDataUrl = false;

    this.initBackgroundLayer();
    this.initCodePlane();
    this.initAtmosphericEffects();
  }

  attachPreviewCanvas(containerCanvas) {
    if (!containerCanvas || containerCanvas === this.containerCanvas) return;
    this.containerCanvas = containerCanvas;
    this.containerCanvas.width = this.width;
    this.containerCanvas.height = this.height;
    this.previewCtx = this.containerCanvas.getContext('2d');
  }

  resetFrameTracking() {
    this.hasReceivedFrame = false;
    this.waitingSinceMs = performance.now();
    if (this.latestBitmap) {
      try { this.latestBitmap.close(); } catch {}
      this.latestBitmap = null;
    }
  }

  updateBitmap(bmp) {
    if (this.latestBitmap && this.latestBitmap !== bmp) {
      try { this.latestBitmap.close(); } catch {}
    }
    this.latestBitmap = bmp;
    if (bmp) {
      this.hasReceivedFrame = true;
    }
  }

  updateFrameImage(dataUrl) {
    if (!dataUrl || this._loadingDataUrl) return;
    this._loadingDataUrl = true;
    const seq = ++this._imageLoadSeq;
    const img = new Image();
    img.onload = () => {
      this._loadingDataUrl = false;
      if (seq !== this._imageLoadSeq || !this.codeCtx) return;
      try {
        this.codeCtx.clearRect(0, 0, this.width, this.height);
        this.codeCtx.drawImage(img, 0, 0, this.width, this.height);
        this.hasReceivedFrame = true;
        if (this.codeTexture) this.codeTexture.needsUpdate = true;
      } catch {}
    };
    img.onerror = () => {
      this._loadingDataUrl = false;
    };
    img.src = dataUrl;
  }

  draw3dFallbackTexture(timedOut = false) {
    if (!this.codeCtx) return;
    const ctx = this.codeCtx;
    const w = this.width;
    const h = this.height;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = timedOut ? '#facc15' : '#38bdf8';
    ctx.lineWidth = Math.max(4, Math.round(w * 0.004));
    ctx.strokeRect(24, 24, w - 48, h - 48);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(w * 0.032)}px system-ui, sans-serif`;
    ctx.fillText(
      timedOut ? '3D TV STAGE — SANDBOX FRAME BELUM TERSEDIA' : 'MEMUAT PANGGUNG 3D TV...',
      w * 0.5,
      h * 0.46
    );
    ctx.fillStyle = timedOut ? '#fde047' : '#bae6fd';
    ctx.font = `600 ${Math.round(w * 0.02)}px system-ui, sans-serif`;
    ctx.fillText(
      timedOut
        ? 'Perangkat membatasi capture live texture. Gunakan Fullscreen / Sinematik atau Ekspor MP4.'
        : 'Menghubungkan frame animasi langsung ke layar TV 3D...',
      w * 0.5,
      h * 0.56
    );
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

    if (settings?.pureBypassMode) return;
    if (!settings?.hudEnabled && !settings?.watermarkEnabled) return;

    const baseScale = Math.min(this.width / 1280, this.height / 720);
    const scaleFactor = baseScale * (Number(settings?.hudScale) || 1);

    if (settings?.hudEnabled) {
      const titleText = (settings.hudTitle || 'UNTITLED MOTION').toUpperCase();
      const subText = (settings.hudSubtitle || 'KURO STUDIO DETERMINISTIC').toUpperCase();
      const pos = settings.hudPosition || 'bottom-left';
      const hudStyle = settings.hudStyle || 'brutalist';
      const accent = settings.tintColor || settings.hudAccentColor || '#ff0055';

      ctx.save();
      const titleSize = Math.round(20 * scaleFactor);
      const subSize = Math.round(11 * scaleFactor);
      ctx.font = `900 ${titleSize}px monospace`;
      const titleWidth = ctx.measureText(titleText).width;
      ctx.font = `700 ${subSize}px monospace`;
      const subWidth = ctx.measureText(subText).width;

      const boxWidth = Math.min(this.width - 32 * baseScale, Math.max(titleWidth, subWidth) + 52 * scaleFactor);
      const boxHeight = 64 * scaleFactor;
      const pad = 28 * baseScale;

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

      if (hudStyle === 'glass') {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.fillRect(x, y, boxWidth, boxHeight);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2 * baseScale;
        ctx.strokeRect(x, y, boxWidth, boxHeight);
      } else if (hudStyle === 'minimal') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(x, y, boxWidth, boxHeight);
        ctx.fillStyle = accent;
        ctx.fillRect(x, y, 5 * scaleFactor, boxHeight);
      } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x + 5 * scaleFactor, y + 5 * scaleFactor, boxWidth, boxHeight);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, boxWidth, boxHeight);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5 * baseScale;
        ctx.strokeRect(x, y, boxWidth, boxHeight);
      }

      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(x + 16 * scaleFactor, y + 22 * scaleFactor, 5 * scaleFactor, 0, Math.PI * 2);
      ctx.fill();

      const textMain = hudStyle === 'brutalist' ? '#000000' : '#ffffff';
      const textSub = hudStyle === 'brutalist' ? '#444444' : '#cbd5e1';

      ctx.fillStyle = textMain;
      ctx.font = `900 ${titleSize}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(titleText, x + 28 * scaleFactor, y + 28 * scaleFactor, boxWidth - 36 * scaleFactor);

      ctx.fillStyle = textSub;
      ctx.font = `700 ${subSize}px monospace`;
      ctx.fillText(subText, x + 28 * scaleFactor, y + 48 * scaleFactor, boxWidth - 36 * scaleFactor);

      ctx.restore();
    }

    if (settings?.watermarkEnabled && (settings?.watermarkText || '').trim()) {
      const wm = String(settings.watermarkText).trim();
      const wmFont = Math.max(11, Math.round(13 * baseScale));
      ctx.save();
      ctx.font = `800 ${wmFont}px monospace`;
      const wmW = ctx.measureText(wm).width + 20 * baseScale;
      const wmH = wmFont * 1.9;
      const wx = this.width - wmW - 22 * baseScale;
      const wy = 20 * baseScale;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
      ctx.fillRect(wx, wy, wmW, wmH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(wx, wy, wmW, wmH);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(wm, wx + wmW * 0.5, wy + wmH * 0.52, wmW - 10);
      ctx.restore();
    }
  }

  drawFrameBackdrop(ctx, width, height, settings = {}) {
    const frameStyle = settings.frameStyle || (settings.stage3d ? '3d-tv' : 'full');
    if (frameStyle !== 'neo-brutalist' && frameStyle !== 'glass') return;

    const c1 = settings.bgColor1 || '#f8fafc';
    const c2 = settings.bgColor2 || '#e0f2fe';
    if (settings.bgType === 'solid') {
      ctx.fillStyle = c1;
    } else {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
    }
    ctx.fillRect(0, 0, width, height);
  }

  drawFrameBorder(ctx, rect, width, height, settings = {}) {
    const frameStyle = settings.frameStyle || (settings.stage3d ? '3d-tv' : 'full');
    if (frameStyle !== 'neo-brutalist' && frameStyle !== 'glass') return;

    ctx.save();
    if (frameStyle === 'neo-brutalist') {
      const offset = Math.max(4, Math.round(Math.min(width, height) * 0.01));
      const bw = Math.max(2.5, Math.round(Math.min(width, height) * 0.005));
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = bw;
      // Offset drop shadow along right and bottom outer frame edge
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(rect.x + offset, rect.y + rect.h, rect.w, offset);
      ctx.fillRect(rect.x + rect.w, rect.y + offset, offset, rect.h);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    } else if (frameStyle === 'glass') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 3;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.w, rect.h, rect.radius);
        ctx.stroke();
      } else {
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      }
    }
    ctx.restore();
  }

  drawAtmosphericPattern(ctx, width, height, t, settings = {}) {
    const pat = settings.bgPattern;
    if (!pat || pat === 'none' || pat === 'auto' || pat === 'plain') return;
    const accent = settings.tintColor || '#38bdf8';

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    if (pat === 'grid-tilted') {
      ctx.translate(width * 0.5, height * 0.5);
      ctx.rotate(-0.18);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1.2;
      const step = Math.max(40, Math.round(Math.min(width, height) * 0.075));
      const shift = (t * 20) % step;
      for (let gx = -width; gx <= width; gx += step) {
        ctx.beginPath(); ctx.moveTo(gx + shift, -height); ctx.lineTo(gx + shift, height); ctx.stroke();
      }
      for (let gy = -height; gy <= height; gy += step) {
        ctx.beginPath(); ctx.moveTo(-width, gy + shift); ctx.lineTo(width, gy + shift); ctx.stroke();
      }
    } else if (pat === 'grid-3d') {
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 1.2;
      const hy = height * 0.56;
      for (let col = -10; col <= 10; col++) {
        ctx.beginPath();
        ctx.moveTo(width * 0.5 + col * width * 0.025, hy);
        ctx.lineTo(width * 0.5 + col * width * 0.16, height);
        ctx.stroke();
      }
      for (let r = 1; r <= 8; r++) {
        const prog = (r / 8 + t * 0.16) % 1;
        const ry = hy + Math.pow(prog, 2) * (height - hy);
        ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(width, ry); ctx.stroke();
      }
    } else if (pat === 'aurora') {
      ctx.globalAlpha = 0.25;
      for (let a = 0; a < 2; a++) {
        const cx = width * (0.3 + a * 0.4 + Math.sin(t * 0.5 + a) * 0.08);
        const cy = height * (0.35 + a * 0.25 + Math.cos(t * 0.4 + a) * 0.08);
        const rA = Math.max(width, height) * 0.45;
        const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, rA);
        g.addColorStop(0, accent);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }
    } else if (pat === 'waves') {
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.24;
      ctx.lineWidth = 2;
      for (let wv = 0; wv < 4; wv++) {
        ctx.beginPath();
        const baseY = height * (0.28 + wv * 0.18);
        for (let wx = 0; wx <= width; wx += 28) {
          const wy = baseY + Math.sin(wx * 0.008 + t * 1.4 + wv) * (height * 0.035);
          if (wx === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawCanvasParticlesOverlay(ctx, width, height, t, settings = {}) {
    if (!settings?.particles) return;
    const style = settings.particleStyle || 'petals-stars';
    const count = Math.min(300, Math.max(20, Number(settings.particleCount) || 100));
    const color = settings.particleColor || '#ffffff';
    const baseScale = Math.min(width, height) / 720;

    ctx.save();
    for (let i = 0; i < count; i++) {
      const rx = ((i * 73 + 19) % 1000) / 1000;
      const ry = ((i * 137 + 41) % 1000) / 1000;
      const spd = 0.03 + (i % 7) * 0.012;
      const moveUp = style === 'fire-sparks' || style === 'sparks';
      const x = ((rx + Math.sin(t * 0.8 + i) * 0.025) % 1 + 1) % 1 * width;
      const y = (moveUp ? ((ry - t * spd) % 1 + 1) % 1 : ((ry + t * spd) % 1)) * height;
      const size = (1.6 + (i % 4) * 1.1) * baseScale;

      ctx.globalAlpha = style === 'dust' ? 0.35 + (i % 3) * 0.15 : 0.65;
      ctx.fillStyle = color;

      if (style === 'petals-stars' && i % 2 === 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 0.9 + i);
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 1.6, size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, style === 'snow' ? size * 1.15 : size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawBrandPill(ctx, width, height, settings = {}) {
    if (!settings?.brandBadgeEnabled || !String(settings?.brandBadgeText || '').trim()) return;
    const label = String(settings.brandBadgeText).trim().toUpperCase();
    const baseScale = Math.min(width / 1280, height / 720);
    const fontSize = Math.max(12, Math.round(16 * baseScale));
    const padX = Math.round(24 * baseScale);
    const padY = Math.round(22 * baseScale);

    ctx.save();
    ctx.font = `900 ${fontSize}px monospace`;
    const bw = Math.min(width * 0.55, ctx.measureText(label).width + 28 * baseScale);
    const bh = fontSize * 2.1;
    const isBrutalist = (settings.hudStyle || 'brutalist') === 'brutalist';

    if (isBrutalist) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(padX + 4 * baseScale, padY + 4 * baseScale, bw, bh);
      ctx.fillStyle = settings.tintColor || '#fde047';
      ctx.fillRect(padX, padY, bw, bh);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5 * baseScale;
      ctx.strokeRect(padX, padY, bw, bh);
      ctx.fillStyle = '#0f172a';
    } else {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fillRect(padX, padY, bw, bh);
      ctx.strokeStyle = settings.tintColor || '#38bdf8';
      ctx.lineWidth = 2 * baseScale;
      ctx.strokeRect(padX, padY, bw, bh);
      ctx.fillStyle = settings.hudTextColor || '#ffffff';
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, padX + bw * 0.5, padY + bh * 0.52, bw - 12 * baseScale);
    ctx.restore();
  }

  drawBottomProgressBar(ctx, width, height, t, settings = {}) {
    if (!settings?.progressBarEnabled) return;
    const totalDur = Math.max(1, Number(settings.totalDuration) || 12);
    const pct = Math.max(0, Math.min(1, t / totalDur));
    const barH = Math.max(5, Math.round(height * 0.009));

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.fillRect(0, height - barH, width, barH);
    ctx.fillStyle = settings.tintColor || '#38bdf8';
    ctx.fillRect(0, height - barH, width * pct, barH);
    ctx.restore();
  }

  applyPostEffects(targetCtx, width, height, t, settings = {}, rectOverride = null) {
    if (!targetCtx || settings?.pureBypassMode) return;
    const box = rectOverride || { x: 0, y: 0, w: width, h: height, radius: 0 };

    // 1. Visual Look / Tint Wash lembut bila pengguna memilih aksen/style khusus
    if (settings?.visualStyle && settings.visualStyle !== 'auto') {
      targetCtx.save();
      targetCtx.globalCompositeOperation = 'soft-light';
      targetCtx.fillStyle = settings.tintColor || '#38bdf8';
      targetCtx.globalAlpha = 0.14;
      targetCtx.fillRect(box.x, box.y, box.w, box.h);
      targetCtx.restore();
    }

    // 2. Pola Latar / Atmosfer Screen Blend
    this.drawAtmosphericPattern(targetCtx, width, height, t, settings);

    // 3. Diagonal Shimmer Sweep
    if (settings?.shimmerSweep) {
      const cycle = (t % 3.2) / 1.1;
      if (cycle <= 1.2) {
        targetCtx.save();
        const sx = box.x - box.w * 0.3 + cycle * (box.w * 1.6);
        const grad = targetCtx.createLinearGradient(sx - 60, box.y, sx + 60, box.y + box.h);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.22)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        targetCtx.fillStyle = grad;
        targetCtx.fillRect(box.x, box.y, box.w, box.h);
        targetCtx.restore();
      }
    }

    // 4. Partikel Udara Canvas 2D (5 gaya)
    this.drawCanvasParticlesOverlay(targetCtx, width, height, t, settings);

    if (settings?.softBloom) {
      targetCtx.save();
      targetCtx.globalCompositeOperation = 'screen';
      const bg = targetCtx.createRadialGradient(width * 0.5, height * 0.45, width * 0.05, width * 0.5, height * 0.45, Math.max(width, height) * 0.65);
      bg.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
      bg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      targetCtx.fillStyle = bg;
      targetCtx.fillRect(0, 0, width, height);
      targetCtx.restore();
    }

    if (settings?.vignette) {
      const cx = width * 0.5;
      const cy = height * 0.5;
      const maxR = Math.max(width, height) * 0.65;
      const vigGrad = targetCtx.createRadialGradient(cx, cy, maxR * 0.45, cx, cy, maxR);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
      targetCtx.fillStyle = vigGrad;
      targetCtx.fillRect(0, 0, width, height);
    }

    if (settings?.filmGrain) {
      const shiftX = Math.floor((t * 37) % 19);
      const shiftY = Math.floor((t * 53) % 19);
      targetCtx.save();
      targetCtx.fillStyle = 'rgba(255,255,255,0.05)';
      const step = Math.max(24, Math.round(Math.min(width, height) * 0.04));
      for (let gx = shiftX; gx < width; gx += step) {
        for (let gy = shiftY; gy < height; gy += step) {
          targetCtx.fillRect(gx, gy, 2, 2);
        }
      }
      targetCtx.restore();
    }

    // 5. Border Bingkai Video (Neo-Brutalist / Glass)
    this.drawFrameBorder(targetCtx, box, width, height, settings);

    // 6. Elemen Tipografi & HUD
    this.drawBrandPill(targetCtx, width, height, settings);
    if (settings?.hudEnabled || settings?.watermarkEnabled) {
      this.renderHud(settings);
      targetCtx.drawImage(this.hudCanvas, 0, 0, width, height);
    }
    this.drawBottomProgressBar(targetCtx, width, height, t, settings);
  }

  /**
   * Fungsi Komposisi Terpadu (Direct Render ke masterCanvas saat ekspor video WebCodecs)
   */
  compositeCustomEffects(ctx, source, width, height, t, settings = {}) {
    const isBypass = Boolean(settings?.pureBypassMode);
    ctx.clearRect(0, 0, width, height);

    if (isBypass) {
      if (source) ctx.drawImage(source, 0, 0, width, height);
      return;
    }

    const totalDur = Number(settings?.totalDuration) || 12;
    const motion = computeMotionAndFrameRect(width, height, t, totalDur, settings);
    const box = motion.rect;

    // Latar belakang frame (saat Neo-Brutalist / Glass)
    this.drawFrameBackdrop(ctx, width, height, settings);

    // Gambar video sumber di dalam area frame dengan Filter, Camera Motion & Transisi
    if (source) {
      ctx.save();
      if (box.radius > 0 && ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(box.x, box.y, box.w, box.h, box.radius);
        ctx.clip();
      } else {
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.w * motion.wipeProgress, box.h);
        ctx.clip();
      }

      ctx.globalAlpha = motion.alpha;
      const cssFilter = buildCssFilterString(settings);
      if (cssFilter !== 'none') ctx.filter = cssFilter;

      const cx = box.x + box.w * 0.5;
      const cy = box.y + box.h * 0.5;
      ctx.translate(cx + motion.tx, cy + motion.ty);
      ctx.scale(motion.scale, motion.scale);
      ctx.translate(-cx, -cy);

      ctx.drawImage(source, box.x, box.y, box.w, box.h);
      ctx.restore();
    }

    // Awan Atmosferik Three.js
    if (settings?.clouds) {
      this.codeGroup.visible = false;
      this.bgMesh.visible = false;
      if (this.particles) this.particles.visible = false;

      this.updateScene(t, { ...settings, particles: false });
      this.renderer.render(this.scene, this.camera);
      ctx.drawImage(this.offscreenThreeCanvas, 0, 0, width, height);

      this.codeGroup.visible = true;
      this.bgMesh.visible = true;
    }

    this.applyPostEffects(ctx, width, height, t, settings, box);
  }

  /**
   * Render satu frame komprehensif ke masterCanvas
   * Mendukung MODE POLOS MURNI (pureBypassMode), BINGKAI/FULLSCREEN KUSTOM & 3D TV STAGE
   */
  renderFrame(t, settings = {}) {
    const isBypass = Boolean(settings?.pureBypassMode);
    const is3dStage = !isBypass && (settings?.frameStyle === '3d-tv' || Boolean(settings?.stage3d));
    const source = this.latestBitmap || this.codeCanvas;

    if (!is3dStage) {
      this.compositeCustomEffects(this.masterCtx, source, this.width, this.height, t, settings);
      if (this.previewCtx) {
        this.previewCtx.clearRect(0, 0, this.width, this.height);
        this.previewCtx.drawImage(this.masterCanvas, 0, 0, this.width, this.height);
      }
    } else {
      if (!this.waitingSinceMs) {
        this.waitingSinceMs = performance.now();
      }
      if (this.latestBitmap) {
        this.codeCtx.clearRect(0, 0, this.width, this.height);
        this.codeCtx.drawImage(this.latestBitmap, 0, 0, this.width, this.height);
      } else if (!this.hasReceivedFrame) {
        const timedOut = performance.now() - this.waitingSinceMs > 600;
        this.draw3dFallbackTexture(timedOut);
      }
      this.codeTexture.needsUpdate = true;

      this.codeGroup.visible = true;
      this.bgMesh.visible = true;

      const stageSettings = {
        ...settings,
        stage3d: true,
        autoOrbit: settings?.cameraMotion === 'auto-orbit' || Boolean(settings?.autoOrbit),
        particles: false
      };

      this.updateBackground(stageSettings);
      this.updateScene(t, stageSettings);
      this.renderer.render(this.scene, this.camera);

      this.masterCtx.clearRect(0, 0, this.width, this.height);
      this.masterCtx.drawImage(this.offscreenThreeCanvas, 0, 0, this.width, this.height);

      this.drawCanvasParticlesOverlay(this.masterCtx, this.width, this.height, t, settings);
      this.drawBrandPill(this.masterCtx, this.width, this.height, settings);
      this.renderHud(settings);
      if (settings.hudEnabled || settings.watermarkEnabled) {
        this.masterCtx.drawImage(this.hudCanvas, 0, 0, this.width, this.height);
      }
      this.drawBottomProgressBar(this.masterCtx, this.width, this.height, t, settings);

      if (this.previewCtx) {
        this.previewCtx.clearRect(0, 0, this.width, this.height);
        this.previewCtx.drawImage(this.masterCanvas, 0, 0, this.width, this.height);
      }
    }
  }

  /**
   * Render HANYA efek overlay di atas Live Preview Iframe (sinkron 100% dengan WebCodecs renderFrame)
   */
  renderOverlayOnly(overlayCtx, width, height, t, settings) {
    if (!overlayCtx) return;

    overlayCtx.clearRect(0, 0, width, height);
    if (settings?.pureBypassMode) return;

    const totalDur = Number(settings?.totalDuration) || 12;
    const motion = computeMotionAndFrameRect(width, height, t, totalDur, settings);

    if (settings?.clouds) {
      this.codeGroup.visible = false;
      this.bgMesh.visible = false;
      this.updateScene(t, { ...settings, particles: false });
      this.renderer.render(this.scene, this.camera);
      overlayCtx.drawImage(this.offscreenThreeCanvas, 0, 0, width, height);
      this.codeGroup.visible = true;
      this.bgMesh.visible = true;
    }

    this.applyPostEffects(overlayCtx, width, height, t, settings, motion.rect);
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
  cleanBg = false,
  onProgress,
  signal
}) {
  const safeDuration = Math.max(1, Math.min(Number(duration) || 10, 300));
  const { width, height } = computeTargetDimensions(resolution, aspectRatio);
  const totalFrames = Math.max(1, Math.round(safeDuration * fps));
  const bitrate = BITRATE_PRESETS[bitratePreset] || BITRATE_PRESETS.high;
  const effectiveSettings = settings?.pureBypassMode
    ? { pureBypassMode: true, stage3d: false, motionSpeed: 1, totalDuration: safeDuration }
    : { ...settings, totalDuration: safeDuration };

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
  renderIframe.setAttribute('sandbox', 'allow-scripts');
  document.body.appendChild(renderIframe);

  let lastGoodBitmap = null;

  try {
    // Suntikkan kode & tunggu aset/CDN/font/image siap hingga maksimal 6 detik
    const readyPromise = new Promise((resolve) => {
      const handler = (e) => {
        if (e.data && e.data.type === 'ctv-render-ready') {
          window.removeEventListener('message', handler);
          resolve();
        }
      };
      window.addEventListener('message', handler);
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve();
      }, 6000);
    });

    const renderFontCss = !effectiveSettings.pureBypassMode
      ? (STUDIO_FONT_PRESETS[effectiveSettings.fontFamily] || '')
      : '';
    renderIframe.srcdoc = compileUniversalCode(code, 'render', {
      width,
      height,
      cleanBg,
      fontCss: renderFontCss,
      studioSettings: effectiveSettings,
      duration: safeDuration
    });
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
      const spd = effectiveSettings.motionSpeed || 1.0;
      const dtSec = (1 / fps) * spd;

      for (let i = 0; i < totalFrames; i++) {
        if (signal?.aborted) {
          try { videoEncoder.close(); } catch {}
          throw new Error('Proses render dibatalkan oleh pengguna.');
        }

        if (encoderError) {
          throw encoderError;
        }

        const simTime = (i / fps) * spd;
        const timeMs = simTime * 1000;

        let frameBitmap = null;
        try {
          frameBitmap = await stepRenderIframe(renderIframe, i, timeMs, dtSec, width, height, i === 0 ? 5000 : 3000);
        } catch {
          // Frame transien
        }

        if (frameBitmap) {
          if (lastGoodBitmap && lastGoodBitmap !== frameBitmap) {
            try { lastGoodBitmap.close(); } catch {}
          }
          compositor.updateBitmap(frameBitmap);
          lastGoodBitmap = frameBitmap;
        } else if (lastGoodBitmap) {
          compositor.updateBitmap(lastGoodBitmap);
        }

        compositor.renderFrame(simTime, effectiveSettings);

        const timestampMicros = Math.round((i * 1_000_000) / fps);
        const frameDurationMicros = Math.round(1_000_000 / fps);
        const isKeyFrame = i % Math.max(1, Math.round(fps * 2)) === 0;

        const videoFrame = new VideoFrame(compositor.masterCanvas, {
          timestamp: timestampMicros,
          duration: frameDurationMicros
        });

        try {
          videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
        } finally {
          videoFrame.close();
        }

        // Backpressure ketat agar RAM aman meski merender 10.000+ frame (hingga 5 menit)
        while (videoEncoder.encodeQueueSize >= 4) {
          if (signal?.aborted) {
            try { videoEncoder.close(); } catch {}
            throw new Error('Proses render dibatalkan oleh pengguna.');
          }
          await new Promise((r) => setTimeout(r, 4));
        }

        // Yield ke UI tiap 2 frame agar tombol Batalkan Render & progress bar tetap responsif
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
            timeRemainingSec,
            currentVideoTimeSec: Math.min(safeDuration, framesDone / fps),
            totalVideoDurationSec: safeDuration
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
        duration: safeDuration,
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
        const totalMs = safeDuration * 1000;
        const spd = effectiveSettings.motionSpeed || 1.0;

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
          compositor.renderFrame(simTime, effectiveSettings);

          if (onProgress) {
            const percent = Math.min(100, Math.round((elapsed / totalMs) * 100));
            const timeRemainingSec = Math.max(0, Math.round((totalMs - elapsed) / 1000));
            onProgress({
              frame: Math.round((elapsed / 1000) * fps),
              totalFrames,
              percent,
              timeRemainingSec,
              currentVideoTimeSec: Math.min(safeDuration, elapsed / 1000),
              totalVideoDurationSec: safeDuration
            });
          }
        }, intervalMs);
      } catch (err) {
        reject(err);
      }
    });
  } finally {
    if (lastGoodBitmap) {
      try { lastGoodBitmap.close(); } catch {}
      lastGoodBitmap = null;
    }
    if (renderIframe && renderIframe.parentNode) {
      renderIframe.parentNode.removeChild(renderIframe);
    }
  }
}
