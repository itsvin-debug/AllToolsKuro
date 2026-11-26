/**
 * Kuro Studio - Universal Multi-Language Animation Compiler
 * Mendeteksi & mengompilasi HTML/CSS/JS, SVG, GLSL, Three.js, p5.js, Processing,
 * TypeScript/React JSX, Python (Manim/Turtle/Pygame), Lua/C++, dan Prompt Teks Alami
 * menjadi dokumen sandbox 60 FPS yang stabil & bebas SyntaxError.
 */

import { compileTextPromptToSceneGraph } from './textPromptCompiler.js';

function buildImportMapIfNeeded(jsCode) {
  if (!/\bimport\s+[\s\S]*?\bfrom\s+['"][^'"]+['"]/.test(jsCode)) {
    return { isModule: false, importMapTag: '' };
  }
  const importMapTag = `<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
    }
  }
  </script>`;
  return { isModule: true, importMapTag };
}

function buildAutoLibraryTags(code, skipThreeIfModule = false) {
  const lower = code.toLowerCase();
  const tags = [];

  if (!skipThreeIfModule && /\bTHREE\./.test(code) && !/three(?:\.min|\.module)?\.js/i.test(lower)) {
    tags.push('<script src="https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js" crossorigin="anonymous"></script>');
  }
  if (/\bgsap\s*\.\s*(?:to|from|fromTo|timeline|registerPlugin|set)\b/.test(code) && !/gsap(?:\.min)?\.js/i.test(lower)) {
    tags.push('<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js" crossorigin="anonymous"></script>');
  }
  if (/\banime\s*\(\s*\{/.test(code) && !/anime(?:\.min)?\.js/i.test(lower)) {
    tags.push('<script src="https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js" crossorigin="anonymous"></script>');
  }
  const usesP5 =
    (/\bfunction\s+setup\s*\(/.test(code) && /\bfunction\s+draw\s*\(/.test(code)) ||
    (/\bcreateCanvas\s*\(/.test(code) && /\bbackground\s*\(/.test(code));
  if (usesP5 && !/p5(?:\.min)?\.js/i.test(lower)) {
    tags.push('<script src="https://cdn.jsdelivr.net/npm/p5@1.11.2/lib/p5.min.js" crossorigin="anonymous"></script>');
  }

  return tags.join('\n  ');
}

// Konversi kutip lengkung hasil copy-paste HANYA di luar string literal & komentar valid
function normalizeSmartQuotesSafely(input) {
  let out = '';
  let quote = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      out += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      out += ch;
      if (ch === '*' && next === '/') {
        out += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }
    if (quote) {
      out += ch;
      if (ch === '\\' && next) {
        out += next;
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      out += ch + next;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      out += ch + next;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '\u201C' || ch === '\u201D') {
      out += '"';
      continue;
    }
    if (ch === '\u2018' || ch === '\u2019') {
      out += "'";
      continue;
    }
    out += ch;
  }

  return out;
}

export function sanitizeUniversalSource(rawCode = '') {
  let code = String(rawCode || '').trim();
  const fencedMatch = code.match(/^```(?:[a-zA-Z0-9_+#-]+)?\s*\r?\n([\s\S]*?)\r?\n?```\s*$/);
  if (fencedMatch && fencedMatch[1]) {
    code = fencedMatch[1].trim();
  } else if (/^```[a-zA-Z0-9_+#-]*\s*\r?\n/.test(code)) {
    code = code.replace(/^```[a-zA-Z0-9_+#-]*\s*\r?\n/, '').replace(/\r?\n?```\s*$/, '').trim();
  }

  // Perbaiki typo copy-paste `- { margin: 0; }` -> `* { margin: 0; }`
  code = code.replace(/(^|\n|>)\s*-\s*\{/g, '$1 * {');
  return normalizeSmartQuotesSafely(code);
}

/**
 * Deteksi ketat teks deskripsi bahasa alami (prompt) agar tidak dieksekusi sebagai JS
 */
export function isNaturalLanguagePrompt(rawInput = '') {
  const code = String(rawInput || '').trim();
  if (!code) return false;

  // Ada tag HTML/SVG/XML/Style/Script → pasti bukan prompt teks polos
  if (/<\/?(?:!doctype|html|head|body|div|span|canvas|svg|style|script|section|main|header|h[1-6]|p|ul|li|path|circle|rect)\b/i.test(code)) {
    return false;
  }

  // Ada sintaks kode atau pemanggilan fungsi animasi yang jelas
  const hasCodeTokens =
    /\b(?:function\s+[a-zA-Z_$][\w$]*\s*\(|const\s+[a-zA-Z_$][\w$]*\s*=|let\s+[a-zA-Z_$][\w$]*\s*=|var\s+[a-zA-Z_$][\w$]*\s*=|import\s+[\w*{}\s,]+\s+from\s+|export\s+(?:default|const|function|class)\b|document\.|window\.|requestAnimationFrame\s*\(|setInterval\s*\(|ctx\s*\.\w+|THREE\.\w+|gsap\.\w+|getContext\s*\(|gl_FragColor|mainImage\s*\(|precision\s+(?:lowp|mediump|highp)\s+float|@keyframes\b|def\s+\w+\s*\(|from\s+manim\s+import|import\s+(?:manim|pygame|turtle|matplotlib|numpy)|class\s+\w+\s*\(|void\s+(?:setup|draw)\s*\(|function\s+love\.|#include\s*<|glBegin\s*\()/.test(code) ||
    /\b(?:background|fill|stroke|rect|circle|ellipse|line|arc|beginPath|fillRect|translate|rotate|scale|createCanvas|clearRect)\s*\(/i.test(code) ||
    /=>\s*[{(]/.test(code) ||
    /^\s*[.#][a-zA-Z_-][\w-]*\s*\{[\s\S]*:[\s\S]*;/m.test(code);

  if (hasCodeTokens) return false;

  const hasPromptHeadings =
    /^(?:brand|merek|judul|subjudul|tagline|harga|promo|cta|adegan\s*\d*|scene\s*\d*|desain(?:\s*&\s*palet)?|palet\s+warna|warna\s+latar|warna\s+aksen|gaya\s+visual|alur\s+adegan|fitur\s+utama|keunggulan|produk|target)\s*[:=-]/im.test(code);
  if (hasPromptHeadings) return true;

  const lines = code.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const words = code.split(/\s+/).filter(Boolean);
  const proseLines = lines.filter((l) => /\S+\s+\S+\s+\S+/.test(l) && !/[;{}]$/.test(l));
  const lacksOperators = !/[=;{}]/.test(code) && !/\b[a-zA-Z_$][\w$]*\([^)]*\)/.test(code);

  return words.length >= 4 && proseLines.length >= Math.max(1, Math.ceil(lines.length * 0.45)) && lacksOperators;
}

function buildCssPreviewMarkup(cssCode) {
  const nodes = [];
  const seen = new Set();
  const selectorRegex = /(?:^|\n|\})\s*([.#][a-zA-Z_-][a-zA-Z0-9_-]*)\b/g;
  let match;
  while ((match = selectorRegex.exec(cssCode)) !== null && nodes.length < 6) {
    const sel = match[1];
    if (seen.has(sel)) continue;
    seen.add(sel);
    if (sel.startsWith('#')) {
      nodes.push(`<div id="${sel.slice(1)}"></div>`);
    } else {
      nodes.push(`<div class="${sel.slice(1)}"></div>`);
    }
  }
  if (nodes.length === 0) {
    return '<div class="kuro-css-stage"><div class="kuro-css-box"></div></div>';
  }
  return nodes.join('\n  ');
}

function buildGlslSandboxDocument(glslSource, width, height, bridgeScript) {
  const isShadertoy = /\bmainImage\s*\(/.test(glslSource);
  const safeGlsl = JSON.stringify(glslSource);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
  ${bridgeScript}
</head>
<body>
  <canvas id="shaderCanvas" width="${width}" height="${height}"></canvas>
  <script>
  (function() {
    var canvas = document.getElementById('shaderCanvas');
    canvas.width = window.innerWidth || ${width};
    canvas.height = window.innerHeight || ${height};
    window.addEventListener('resize', function() {
      canvas.width = window.innerWidth || ${width};
      canvas.height = window.innerHeight || ${height};
    });

    var isShadertoy = ${isShadertoy ? 'true' : 'false'};
    var gl = isShadertoy
      ? (canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: true }) || canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true }))
      : (canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: true }) || canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: true }));

    if (!gl) {
      window.parent.postMessage({ type: 'ctv-error', error: 'WebGL tidak didukung browser untuk menjalankan Shader.' }, '*');
      return;
    }

    var isWebGL2 = (typeof WebGL2RenderingContext !== 'undefined') && (gl instanceof WebGL2RenderingContext);
    var userSrc = ${safeGlsl};

    var vertSrc = isWebGL2
      ? '#version 300 es\\nin vec2 a_pos;\\nvoid main() { gl_Position = vec4(a_pos, 0.0, 1.0); }'
      : 'attribute vec2 a_pos;\\nvoid main() { gl_Position = vec4(a_pos, 0.0, 1.0); }';

    var fragSrc = '';
    if (isShadertoy) {
      if (isWebGL2) {
        fragSrc = '#version 300 es\\nprecision highp float;\\n' +
          'uniform vec3 iResolution;\\nuniform float iTime;\\nuniform int iFrame;\\nuniform vec4 iMouse;\\n' +
          'uniform vec2 u_resolution;\\nuniform float u_time;\\n' +
          'out vec4 _outColor;\\n' +
          userSrc + '\\n' +
          'void main() { vec4 c = vec4(0.0, 0.0, 0.0, 1.0); mainImage(c, gl_FragCoord.xy); _outColor = vec4(c.rgb, 1.0); }';
      } else {
        fragSrc = 'precision highp float;\\n' +
          'uniform vec3 iResolution;\\nuniform float iTime;\\nuniform int iFrame;\\nuniform vec4 iMouse;\\n' +
          'uniform vec2 u_resolution;\\nuniform float u_time;\\n' +
          userSrc + '\\n' +
          'void main() { vec4 c = vec4(0.0, 0.0, 0.0, 1.0); mainImage(c, gl_FragCoord.xy); gl_FragColor = vec4(c.rgb, 1.0); }';
      }
    } else {
      var hasPrecision = /precision\\s+(lowp|mediump|highp)\\s+float/.test(userSrc);
      var header = hasPrecision ? '' : 'precision highp float;\\n';
      var extraUniforms = '';
      if (!/uniform\\s+float\\s+u_time\\b/.test(userSrc)) extraUniforms += 'uniform float u_time;\\n';
      if (!/uniform\\s+float\\s+uTime\\b/.test(userSrc)) extraUniforms += 'uniform float uTime;\\n';
      if (!/uniform\\s+float\\s+time\\b/.test(userSrc)) extraUniforms += 'uniform float time;\\n';
      if (!/uniform\\s+float\\s+iTime\\b/.test(userSrc)) extraUniforms += 'uniform float iTime;\\n';
      if (!/uniform\\s+vec2\\s+u_resolution\\b/.test(userSrc)) extraUniforms += 'uniform vec2 u_resolution;\\n';
      if (!/uniform\\s+vec2\\s+uResolution\\b/.test(userSrc)) extraUniforms += 'uniform vec2 uResolution;\\n';
      if (!/uniform\\s+vec2\\s+resolution\\b/.test(userSrc)) extraUniforms += 'uniform vec2 resolution;\\n';
      if (!/uniform\\s+vec3\\s+iResolution\\b/.test(userSrc)) extraUniforms += 'uniform vec3 iResolution;\\n';
      if (!/uniform\\s+vec2\\s+u_mouse\\b/.test(userSrc)) extraUniforms += 'uniform vec2 u_mouse;\\n';
      if (!/uniform\\s+vec4\\s+iMouse\\b/.test(userSrc)) extraUniforms += 'uniform vec4 iMouse;\\n';
      fragSrc = header + extraUniforms + userSrc;
    }

    function compile(type, source) {
      var s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        var info = gl.getShaderInfoLog(s) || 'Shader compile failed';
        window.parent.postMessage({ type: 'ctv-error', error: 'GLSL Error: ' + info }, '*');
        return null;
      }
      return s;
    }

    var vs = compile(gl.VERTEX_SHADER, vertSrc);
    var fs = compile(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      window.parent.postMessage({ type: 'ctv-error', error: 'GLSL Link: ' + gl.getProgramInfoLog(prog) }, '*');
      return;
    }

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var posLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(prog);

    var mouseX = canvas.width * 0.5;
    var mouseY = canvas.height * 0.5;
    canvas.addEventListener('pointermove', function(e) {
      mouseX = e.clientX || mouseX;
      mouseY = (canvas.height - (e.clientY || 0));
    });

    var frameCount = 0;
    function render(nowMs) {
      var t = (nowMs || performance.now()) * 0.001;
      gl.viewport(0, 0, canvas.width, canvas.height);
      var set1f = function(name, val) { var l = gl.getUniformLocation(prog, name); if (l !== null) gl.uniform1f(l, val); };
      var set2f = function(name, a, b) { var l = gl.getUniformLocation(prog, name); if (l !== null) gl.uniform2f(l, a, b); };
      var set3f = function(name, a, b, c) { var l = gl.getUniformLocation(prog, name); if (l !== null) gl.uniform3f(l, a, b, c); };
      var set4f = function(name, a, b, c, d) { var l = gl.getUniformLocation(prog, name); if (l !== null) gl.uniform4f(l, a, b, c, d); };
      var set1i = function(name, a) { var l = gl.getUniformLocation(prog, name); if (l !== null) gl.uniform1i(l, a); };

      set1f('u_time', t); set1f('uTime', t); set1f('time', t); set1f('iTime', t);
      set2f('u_resolution', canvas.width, canvas.height);
      set2f('uResolution', canvas.width, canvas.height);
      set2f('resolution', canvas.width, canvas.height);
      set3f('iResolution', canvas.width, canvas.height, 1.0);
      set2f('u_mouse', mouseX / Math.max(1, canvas.width), mouseY / Math.max(1, canvas.height));
      set4f('iMouse', mouseX, mouseY, 0.0, 0.0);
      set1i('iFrame', frameCount++);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  })();
  </script>
</body>
</html>`;
}

/**
 * Strip deklarasi tipe TypeScript ringan agar kode TS Canvas / Three.js langsung berjalan di browser
 */
function stripTypeScriptTypes(tsCode = '') {
  return String(tsCode || '')
    .replace(/^\s*(?:export\s+)?interface\s+[A-Za-z_]\w*(?:<[^>]+>)?(?:\s+extends\s+[\w.,\s<>]+)?\s*\{[\s\S]*?\}\s*$/gm, '')
    .replace(/^\s*(?:export\s+)?type\s+[A-Za-z_]\w*(?:<[^>]+>)?\s*=\s*[^;]+;\s*$/gm, '')
    .replace(/\b(?:public|private|protected|readonly)\s+(?=[a-zA-Z_$])/g, '')
    .replace(/\s+as\s+(?:const|any|unknown|number|string|boolean|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|WebGLRenderingContext|WebGL2RenderingContext|THREE\.[A-Za-z0-9_.]+)(?=[;\s,)=])/g, '')
    .replace(/(function\s+[a-zA-Z_$][\w$]*|\([^)]*\))\s*:\s*(?:void|number|string|boolean|any|unknown|Promise<[^>]+>|[A-Z]\w*(?:\[\])?)(?=\s*(?:\{|=>))/g, '$1')
    .replace(/(\b(?:const|let|var)\s+[a-zA-Z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$.<>\[\]|&]*(?:\s*[|&]\s*[A-Za-z_$][\w$.<>\[\]|&]*)*(?=\s*[=;])/g, '$1')
    .replace(/([a-zA-Z_$][\w$]*)\s*\?\s*:\s*[A-Za-z_$][\w$.<>\[\]|&]*(?:\s*[|&]\s*[A-Za-z_$][\w$.<>\[\]|&]*)*(?=\s*[,)])/g, '$1')
    .replace(/([a-zA-Z_$][\w$]*)\s*:\s*(?:number|string|boolean|any|unknown|void|HTMLCanvasElement|CanvasRenderingContext2D|THREE\.[A-Za-z0-9_.]+)(?:\[\])?(?=[,)])/g, '$1');
}

/**
 * Transpiler Processing Java (void setup/draw) -> p5.js
 */
function transpileProcessingJava(javaCode = '') {
  let out = String(javaCode || '');
  out = out
    .replace(/\bvoid\s+(setup|draw|mousePressed|mouseReleased|mouseMoved|keyPressed)\s*\(/g, 'function $1(')
    .replace(/\b(?:final\s+)?(?:float|int|double|boolean|String|color|PVector)\s+([a-zA-Z_]\w*(?:\[\s*\])*)\s*(?=[=;,])/g, 'let $1')
    .replace(/(\bfunction\s+[a-zA-Z_]\w*\s*\([^)]*\))|\b(?:float|int|double|boolean|String|color|PVector)\s+([a-zA-Z_]\w*)\s*(?=[,)])/g, (m, fnHead, paramName) => {
      if (fnHead) return fnHead;
      return paramName || m;
    })
    .replace(/\bsize\s*\(\s*(\d+)\s*,\s*(\d+)[^)]*\)\s*;?/g, 'createCanvas(window.innerWidth || $1, window.innerHeight || $2);')
    .replace(/\bnew\s+PVector\s*\(/g, 'createVector(')
    .replace(/\bPVector\.random2D\s*\(/g, 'p5.Vector.random2D(')
    .replace(/\bPVector\.add\s*\(/g, 'p5.Vector.add(')
    .replace(/\bPVector\.sub\s*\(/g, 'p5.Vector.sub(');
  return out;
}

const PY_COLOR_MAP = {
  BLUE: '#38bdf8',
  BLUE_A: '#c7e9f1',
  BLUE_C: '#58c4dd',
  RED: '#ef4444',
  GREEN: '#22c55e',
  YELLOW: '#facc15',
  GOLD: '#f59e0b',
  PURPLE: '#a855f7',
  PINK: '#ec4899',
  ORANGE: '#f97316',
  TEAL: '#14b8a6',
  WHITE: '#f8fafc',
  BLACK: '#0f172a',
  GRAY: '#64748b',
  GREY: '#64748b',
  CYAN: '#06b6d4'
};

/**
 * Adaptor Canvas 2D 60 FPS untuk kode Python (Manim/Turtle/Pygame/Matplotlib), Lua, & C++ OpenGL
 */
function buildForeignCodeCanvasAdapter(foreignCode, langLabel, width, height, bridgeScript) {
  const src = String(foreignCode || '');
  const classMatch = src.match(/\bclass\s+([A-Za-z_]\w*)/) || src.match(/\bdef\s+([A-Za-z_]\w*)/);
  const sceneTitle = classMatch ? classMatch[1].replace(/([a-z])([A-Z])/g, '$1 $2') : `${langLabel} Motion Scene`;

  const extractedTexts = [];
  const strRegex = /(?:Text|Tex|MathTex|Title|set_caption|Label|draw_text|putText)\s*\(\s*[rf]?(['"])((?:\\.|(?!\1).){2,90})\1/g;
  let m;
  while ((m = strRegex.exec(src)) !== null && extractedTexts.length < 4) {
    if (m[2] && !extractedTexts.includes(m[2])) extractedTexts.push(m[2]);
  }

  const hexMatches = Array.from(src.matchAll(/#[0-9a-fA-F]{6}\b/g)).map((h) => h[0]);
  const namedColors = [];
  for (const [k, hex] of Object.entries(PY_COLOR_MAP)) {
    if (new RegExp(`\\b${k}\\b`, 'i').test(src)) namedColors.push(hex);
  }
  const paletteColors = [...new Set([...hexMatches, ...namedColors])];
  if (paletteColors.length === 0) paletteColors.push('#0284c7', '#f59e0b', '#10b981');

  const shapeTypes = [];
  if (/\b(?:Circle|Dot|circle|draw\.circle)\b/.test(src)) shapeTypes.push('circle');
  if (/\b(?:Square|Rectangle|rect|draw\.rect|Cube|Box)\b/.test(src)) shapeTypes.push('square');
  if (/\b(?:Triangle|Polygon|polygon|draw\.polygon|glVertex)\b/.test(src)) shapeTypes.push('triangle');
  if (/\b(?:Star|star)\b/.test(src)) shapeTypes.push('star');
  if (/\b(?:Line|Arrow|Vector|forward|line|draw\.line)\b/.test(src)) shapeTypes.push('orbit-arrow');
  if (shapeTypes.length === 0) shapeTypes.push('circle', 'square', 'orbit-arrow');

  const hasAxes = /\b(?:Axes|NumberPlane|CoordinateSystem|plot|grid)\b/i.test(src);
  const usesDarkHint = /\b(?:Manim|Scene|ThreeDScene|pygame|glClear|OpenGL|space|orbit|cosmos)\b/i.test(src);

  const spec = JSON.stringify({
    langLabel,
    sceneTitle,
    texts: extractedTexts,
    colors: paletteColors.slice(0, 4),
    shapes: shapeTypes,
    hasAxes,
    isDark: usesDarkHint
  }).replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
  ${bridgeScript}
</head>
<body>
  <canvas id="foreignStage" width="${width}" height="${height}"></canvas>
  <script>
  (function() {
    var CFG = ${spec};
    var canvas = document.getElementById('foreignStage');
    var ctx = canvas.getContext('2d');
    function syncSize() {
      var w = window.innerWidth || ${width};
      var h = window.innerHeight || ${height};
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    syncSize();
    window.addEventListener('resize', syncSize);

    function easeOutExpo(x) { return x >= 1 ? 1 : 1 - Math.pow(2, -10 * Math.max(0, x)); }

    function drawFrame(nowMs) {
      syncSize();
      var W = canvas.width, H = canvas.height;
      var t = (nowMs || performance.now()) * 0.001;
      var enter = easeOutExpo(Math.min(1, t / 0.9));

      var grad = ctx.createLinearGradient(0, 0, W, H);
      if (CFG.isDark) {
        grad.addColorStop(0, '#0c1322');
        grad.addColorStop(1, '#162033');
      } else {
        grad.addColorStop(0, '#f8fafc');
        grad.addColorStop(1, '#e2e8f0');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Grid / Axes
      ctx.save();
      ctx.strokeStyle = CFG.isDark ? 'rgba(148,163,184,0.16)' : 'rgba(15,23,42,0.08)';
      ctx.lineWidth = 1;
      var step = Math.max(40, Math.round(Math.min(W, H) * 0.075));
      for (var gx = (W * 0.5) % step; gx < W; gx += step) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (var gy = (H * 0.5) % step; gy < H; gy += step) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }
      if (CFG.hasAxes) {
        ctx.strokeStyle = CFG.isDark ? 'rgba(248,250,252,0.4)' : 'rgba(15,23,42,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(W * 0.08, H * 0.52); ctx.lineTo(W * 0.92, H * 0.52);
        ctx.moveTo(W * 0.5, H * 0.14); ctx.lineTo(W * 0.5, H * 0.88);
        ctx.stroke();
      }
      ctx.restore();

      // Render shapes parsed from source script
      var cx = W * 0.5;
      var cy = H * (CFG.texts.length ? 0.56 : 0.52);
      var baseR = Math.min(W, H) * 0.18 * enter;

      for (var i = 0; i < CFG.shapes.length; i++) {
        var shape = CFG.shapes[i];
        var col = CFG.colors[i % CFG.colors.length];
        var angle = t * (0.65 + i * 0.25) + i * 1.4;
        var ox = CFG.shapes.length > 1 ? Math.cos(angle * 0.5) * baseR * 0.45 : 0;
        var oy = CFG.shapes.length > 1 ? Math.sin(angle * 0.5) * baseR * 0.22 : 0;

        ctx.save();
        ctx.translate(cx + ox, cy + oy);
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineWidth = 4;

        if (shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, baseR * 0.82, 0, Math.PI * 2 * Math.min(1, t / 0.85));
          ctx.stroke();
          ctx.globalAlpha = 0.16;
          ctx.fill();
        } else if (shape === 'square') {
          ctx.rotate(angle * 0.35);
          var sq = baseR * 1.15;
          ctx.strokeRect(-sq * 0.5, -sq * 0.5, sq, sq);
          ctx.globalAlpha = 0.16;
          ctx.fillRect(-sq * 0.5, -sq * 0.5, sq, sq);
        } else if (shape === 'triangle' || shape === 'star') {
          var pts = shape === 'star' ? 5 : 3;
          ctx.rotate(angle * 0.4);
          ctx.beginPath();
          for (var k = 0; k < pts * (shape === 'star' ? 2 : 1); k++) {
            var rad = (shape === 'star' && k % 2 === 1) ? baseR * 0.38 : baseR * 0.88;
            var a = (k * Math.PI * 2) / (pts * (shape === 'star' ? 2 : 1)) - Math.PI * 0.5;
            if (k === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
            else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.globalAlpha = 0.18;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(-baseR, Math.sin(t * 2.2) * baseR * 0.3);
          ctx.bezierCurveTo(-baseR * 0.3, -baseR * 0.8, baseR * 0.3, baseR * 0.8, baseR, -Math.sin(t * 2.2) * baseR * 0.3);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Extracted Text Objects & Scene Badge
      ctx.save();
      var titleCol = CFG.isDark ? '#f8fafc' : '#0f172a';
      ctx.font = '800 ' + Math.round(Math.min(W, H) * 0.045) + 'px system-ui, sans-serif';
      ctx.fillStyle = titleCol;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      var headline = (CFG.texts[0] || CFG.sceneTitle);
      ctx.fillText(headline, W * 0.5, H * 0.12, W * 0.84);

      if (CFG.texts.length > 1) {
        ctx.font = '600 ' + Math.round(Math.min(W, H) * 0.028) + 'px system-ui, sans-serif';
        ctx.fillStyle = CFG.colors[0];
        ctx.fillText(CFG.texts.slice(1).join('  •  '), W * 0.5, H * 0.84, W * 0.84);
      }
      ctx.restore();

      requestAnimationFrame(drawFrame);
    }
    requestAnimationFrame(drawFrame);
  })();
  </script>
</body>
</html>`;
}

export function detectCodeLanguage(rawInput = '') {
  const code = sanitizeUniversalSource(rawInput);
  if (!code) {
    return { category: 'empty', label: 'Kosong' };
  }

  const lower = code.toLowerCase();

  // 1. Teks Bahasa Alami / Prompt Video
  if (isNaturalLanguagePrompt(code)) {
    return { category: 'text-prompt', label: 'Prompt Teks' };
  }

  // 2. Full HTML Document
  if (
    /^<!doctype\s+html/i.test(code) ||
    lower.includes('<html') ||
    (lower.includes('<head') && lower.includes('<body'))
  ) {
    return { category: 'full-html', label: 'HTML5' };
  }

  // 3. SVG Murni
  if (/^<\s*svg\b/i.test(code) && !lower.includes('<script') && !lower.includes('<div')) {
    return { category: 'pure-svg', label: 'SVG' };
  }

  // 4. React JSX / TSX komponen
  const looksReactJsx =
    (/\bimport\s+[\s\S]*from\s+['"]react['"]/.test(code) || /\buse(?:State|Effect|Ref|Memo)\s*\(/.test(code)) &&
    (/return\s*\(\s*<[A-Za-z]/.test(code) || /<[A-Z][A-Za-z0-9]*[\s/>]/.test(code));
  if (looksReactJsx) {
    return { category: 'react-jsx', label: 'React JSX/TSX' };
  }

  // 5. HTML Fragment
  if (/<\/?(?:div|span|canvas|section|main|header|footer|h[1-6]|p|ul|li|img|svg|style|script|link)\b/i.test(code)) {
    return { category: 'html-fragment', label: 'HTML Fragment' };
  }

  // 6. GLSL Fragment Shader
  const looksGlsl =
    /\bgl_FragColor\b/.test(code) ||
    /\bmainImage\s*\(\s*out\s+vec4\b/.test(code) ||
    /\bprecision\s+(?:lowp|mediump|highp)\s+float\b/.test(code) ||
    (/\bvoid\s+main\s*\(\s*(?:void)?\s*\)/.test(code) && /\b(?:vec[234]|mat[234]|uniform\s+float|fragColor)\b/.test(code));
  if (looksGlsl) {
    return { category: 'glsl-shader', label: 'GLSL' };
  }

  // 7. Processing Java (void setup() / void draw() + Java types)
  if (/\bvoid\s+(?:setup|draw)\s*\(/.test(code) && (/\b(?:float|int|color|PVector|size)\b/.test(code) || !/\bfunction\b/.test(code))) {
    return { category: 'processing-java', label: 'Processing' };
  }

  // 8. Bahasa Non-Browser (Python / Manim / Pygame / Turtle / Lua / C++)
  if (
    /\bfrom\s+(?:manim|pygame|turtle|matplotlib)\b|\bimport\s+(?:manim|pygame|turtle|matplotlib)\b/.test(code) ||
    /\bdef\s+[a-zA-Z_]\w*\s*\([^)]*\)\s*:|\bclass\s+[A-Za-z_]\w*\s*\(\s*(?:Scene|ThreeDScene|MovingCameraScene)\s*\)\s*:/.test(code) ||
    /\bfunction\s+love\.(?:draw|load|update)\s*\(/.test(code) ||
    /#include\s*<|\bglBegin\s*\(/.test(code)
  ) {
    const langHint = /\blove\./.test(code)
      ? 'Lua LÖVE2D'
      : /#include|\bglBegin/.test(code)
      ? 'C++ OpenGL'
      : /\bmanim\b/i.test(code)
      ? 'Python Manim'
      : /\bturtle\b/i.test(code)
      ? 'Python Turtle'
      : /\bpygame\b/i.test(code)
      ? 'Pygame'
      : 'Python';
    return { category: 'foreign-anim', label: langHint };
  }

  // 9. p5.js JavaScript
  if (
    (/\bfunction\s+setup\s*\(/.test(code) && /\bfunction\s+draw\s*\(/.test(code)) ||
    (/\bcreateCanvas\s*\(/.test(code) && /\bbackground\s*\(/.test(code))
  ) {
    return { category: 'p5-js', label: 'p5.js' };
  }

  // 10. TypeScript murni (non-JSX)
  if (
    /\b(?:interface\s+[A-Z]\w*|type\s+[A-Z]\w*\s*=)/.test(code) ||
    /:\s*(?:number|string|boolean|void|HTMLCanvasElement|CanvasRenderingContext2D|WebGLRenderingContext|THREE\.[A-Za-z0-9_.]+)\b/.test(code) ||
    /\bas\s+(?:HTMLCanvasElement|CanvasRenderingContext2D|any|unknown)\b/.test(code)
  ) {
    return { category: 'typescript', label: 'TypeScript' };
  }

  // 11. Pure CSS
  const looksJs =
    /\b(?:function\s*[a-zA-Z0-9_$]*\s*\(|const\s+|let\s+|var\s+|import\s+|document\.|window\.|requestAnimationFrame|new\s+THREE\.|ctx\s*\.)/.test(code) ||
    /=>\s*[{(]/.test(code);
  const looksCss =
    !looksJs &&
    (/@keyframes\b/.test(code) ||
      /(?:^|\n|\})\s*(?:[.#]?[a-zA-Z*_-][a-zA-Z0-9_.*#,:()\s>-]*)\s*\{[^}]*:[^}]+;/.test(code));
  if (looksCss) {
    return { category: 'pure-css', label: 'CSS' };
  }

  // 12. Pure JS Standalone vs Frame Draw Snippet
  const isStandaloneJs =
    /\b(?:document\.|window\.|requestAnimationFrame|setInterval|new\s+THREE\.|getContext\s*\(|addEventListener|import\s+)/.test(code);
  if (isStandaloneJs) {
    return { category: 'pure-js-standalone', label: 'JavaScript' };
  }

  return { category: 'pure-js-draw', label: 'JS Canvas' };
}

/**
 * Compiler Universal Otomatis untuk Live Preview & Render Deterministik
 */
export function compileUniversalCode(rawInput = '', mode = 'live', options = {}) {
  const {
    width = 1280,
    height = 720,
    cleanBg = false,
    fontCss = '',
    studioSettings = {},
    duration = 12,
    buildLiveBridge,
    buildRenderBridge
  } = options;

  const baseBridgeScript = mode === 'render'
    ? buildRenderBridge(width, height)
    : buildLiveBridge(width, height);

  const safeFontCss = fontCss ? String(fontCss).replace(/[<>{}]/g, '') : '';
  const fontHook = safeFontCss
    ? `<style id="ctv-font-override">html,body,h1,h2,h3,h4,p,span,div,button,a{font-family:${safeFontCss} !important;}</style>`
    : '';
  const cleanBgHook = cleanBg
    ? '<style>h1,h2,h3,h4,h5,h6,p,span,a,button,label,text,tspan{opacity:0!important;color:transparent!important;text-shadow:none!important;}</style><script>(function(){if(window.CanvasRenderingContext2D){var p=CanvasRenderingContext2D.prototype;p.fillText=function(){};p.strokeText=function(){};}})();' + '<' + '/script>'
    : '';
  const bridgeScript = baseBridgeScript + fontHook + cleanBgHook;

  // Sisipkan payload ke <head> tanpa ekspansi karakter $ pada String.prototype.replace
  const injectIntoHead = (doc, payload) => {
    const exactIdx = doc.indexOf('<head>');
    if (exactIdx !== -1) {
      const splitAt = exactIdx + 6;
      return `${doc.slice(0, splitAt)}${payload}${doc.slice(splitAt)}`;
    }
    const headMatch = /<head\b[^>]*>/i.exec(doc);
    if (headMatch) {
      const splitAt = headMatch.index + headMatch[0].length;
      return `${doc.slice(0, splitAt)}${payload}${doc.slice(splitAt)}`;
    }
    const htmlMatch = /<html\b[^>]*>/i.exec(doc);
    if (htmlMatch) {
      const splitAt = htmlMatch.index + htmlMatch[0].length;
      return `${doc.slice(0, splitAt)}<head>${payload}</head>${doc.slice(splitAt)}`;
    }
    return null;
  };

  const cleanCode = sanitizeUniversalSource(rawInput);
  const detected = detectCodeLanguage(cleanCode);
  const { category } = detected;

  if (category === 'empty') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${bridgeScript}<style>html,body{margin:0;width:100%;height:100%;background:#09090b;color:#94a3b8;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;font-size:14px;}</style></head><body>Tempel kode animasi di editor untuk memulai preview...</body></html>`;
  }

  // Jalur Teks Deskripsi Prompt yang ditempel ke Editor Kode
  if (category === 'text-prompt') {
    const compiled = compileTextPromptToSceneGraph(cleanCode, { ...studioSettings, usePromptHexColors: true }, duration);
    const html = cleanBg ? compiled.generatedCleanBgHtmlCode : compiled.generatedHtmlCode;
    return injectIntoHead(html, bridgeScript) || html;
  }

  // A. Full HTML Document
  if (category === 'full-html') {
    const libTags = buildAutoLibraryTags(cleanCode, /type=["']importmap["']/.test(cleanCode));
    const injectPayload = `${bridgeScript}${libTags ? '\n  ' + libTags : ''}`;
    const injected = injectIntoHead(cleanCode, injectPayload);
    if (injected) return injected;
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${injectPayload}</head><body>${cleanCode}</body></html>`;
  }

  // B. Pure SVG Vector
  if (category === 'pure-svg') {
    const normalizedSvg = /preserveAspectRatio\s*=/.test(cleanCode)
      ? cleanCode
      : cleanCode.replace(/<svg\b/i, '<svg preserveAspectRatio="xMidYMid meet"');
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #09090b; display: flex; align-items: center; justify-content: center; }
    svg { width: 100%; height: 100%; max-width: 100vw; max-height: 100vh; }
  </style>
  ${bridgeScript}
</head>
<body>
  ${normalizedSvg}
</body>
</html>`;
  }

  // C. React JSX / TSX Komponen
  if (category === 'react-jsx') {
    const stripped = stripTypeScriptTypes(cleanCode)
      .replace(/^\s*import\s+[\s\S]*?from\s+['"]react['"];?\s*$/gm, '')
      .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
      .replace(/\bexport\s+default\s+/g, 'const __KuroDefaultExport = ')
      .replace(/\bexport\s+(?=(?:const|let|var|function|class)\b)/g, '');
    const safeJsx = stripped.replace(/<\/script>/gi, '<\\/script>');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; overflow: hidden; background: #09090b; color: #f8fafc; font-family: system-ui, sans-serif; }
  </style>
  ${bridgeScript}
  <script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.4/babel.min.js" crossorigin="anonymous"></script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react">
    const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;
    ${safeJsx}
    (function() {
      var TargetComp = typeof __KuroDefaultExport !== 'undefined' ? __KuroDefaultExport
        : (typeof App !== 'undefined' ? App : null);
      if (TargetComp) {
        var rootEl = document.getElementById('root');
        if (ReactDOM.createRoot) ReactDOM.createRoot(rootEl).render(React.createElement(TargetComp));
        else ReactDOM.render(React.createElement(TargetComp), rootEl);
      }
    })();
  </script>
</body>
</html>`;
  }

  // D. HTML Fragment
  if (category === 'html-fragment') {
    const libTags = buildAutoLibraryTags(cleanCode);
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #09090b; color: #f8fafc; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  </style>
  ${bridgeScript}
  ${libTags}
</head>
<body>
  ${cleanCode}
</body>
</html>`;
  }

  // E. GLSL Shader
  if (category === 'glsl-shader') {
    return buildGlslSandboxDocument(cleanCode, width, height, bridgeScript);
  }

  // F. Foreign Non-Browser Animation (Python Manim/Turtle/Pygame, Lua, C++ OpenGL)
  if (category === 'foreign-anim') {
    return buildForeignCodeCanvasAdapter(cleanCode, detected.label, width, height, bridgeScript);
  }

  // G. p5.js & Processing Java
  if (category === 'p5-js' || category === 'processing-java') {
    const p5JsCode = category === 'processing-java' ? transpileProcessingJava(cleanCode) : cleanCode;
    const escapedP5 = p5JsCode.replace(/<\/script>/gi, '<\\/script>');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
  ${bridgeScript}
  <script src="https://cdn.jsdelivr.net/npm/p5@1.11.2/lib/p5.min.js" crossorigin="anonymous"></script>
</head>
<body>
  <script>
    ${escapedP5}
    window.addEventListener('resize', function() {
      if (typeof resizeCanvas === 'function') {
        try { resizeCanvas(window.innerWidth || ${width}, window.innerHeight || ${height}); } catch(_) {}
      }
    });
  </script>
</body>
</html>`;
  }

  // H. Pure CSS Keyframe Motion
  if (category === 'pure-css') {
    const stageMarkup = buildCssPreviewMarkup(cleanCode);
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%; overflow: hidden;
      background: #09090b; color: #f8fafc;
      display: flex; align-items: center; justify-content: center;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    }
    .kuro-css-stage { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
    ${cleanCode}
  </style>
  ${bridgeScript}
</head>
<body>
  ${stageMarkup}
</body>
</html>`;
  }

  // I. Pure JS Standalone atau TypeScript murni
  if (category === 'pure-js-standalone' || category === 'typescript') {
    const finalJs = category === 'typescript' ? stripTypeScriptTypes(cleanCode) : cleanCode;
    const { isModule, importMapTag } = buildImportMapIfNeeded(finalJs);
    const libTags = buildAutoLibraryTags(finalJs, isModule);
    const safeScriptTag = isModule ? '<script type="module">' : '<script>';
    const escapedJs = finalJs.replace(/<\/script>/gi, '<\\/script>');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
  ${importMapTag}
  ${bridgeScript}
  ${libTags}
</head>
<body>
  <div id="app" style="position:relative;width:100%;height:100%;">
    <canvas id="canvas" width="${width}" height="${height}"></canvas>
  </div>
  <script>
    (function() {
      var defaultCanvas = document.getElementById('canvas');
      if (defaultCanvas) {
        defaultCanvas.width = window.innerWidth || ${width};
        defaultCanvas.height = window.innerHeight || ${height};
      }
      var _origGetById = document.getElementById.bind(document);
      document.getElementById = function(id) {
        var el = _origGetById(id);
        if (!el && defaultCanvas) return defaultCanvas;
        return el;
      };
    })();
  </script>
  ${safeScriptTag}
    ${escapedJs}
  </script>
</body>
</html>`;
  }

  // J. Pure JS Canvas Draw Snippet (dengan validasi sintaks awal via new Function)
  const serializedSnippet = JSON.stringify(cleanCode).replace(/<\/script>/gi, '<\\/script>');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
  ${bridgeScript}
  ${buildAutoLibraryTags(cleanCode)}
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

      var compiledDraw = null;
      try {
        compiledDraw = new Function('ctx', 'canvas', 'width', 'height', 'time', 't', 'dt', 'frame', 'W', 'H', 'c', ${serializedSnippet});
      } catch (syntaxErr) {
        window.parent.postMessage({
          type: 'ctv-error',
          error: 'Sintaks JS: ' + (syntaxErr && syntaxErr.message ? syntaxErr.message : String(syntaxErr))
        }, '*');
        return;
      }

      window.__userDraw = function(uCtx, uCanvas, uW, uH, uTime, uT, uDt, uFrame) {
        return compiledDraw(uCtx, uCanvas, uW, uH, uTime, uT, uDt, uFrame, uW, uH, uCanvas);
      };

      var lastTime = performance.now();
      var runtimeReported = false;
      function loop(now) {
        var t = Math.max(0.001, (now || performance.now()) * 0.001);
        var dt = Math.max(0.001, Math.min(0.1, (now - lastTime) * 0.001));
        lastTime = now;
        var frame = Math.round(t * 60);
        try {
          window.__userDraw(ctx, canvas, canvas.width, canvas.height, t, t, dt, frame);
        } catch (err) {
          if (!runtimeReported) {
            runtimeReported = true;
            window.parent.postMessage({ type: 'ctv-error', error: 'JS Runtime: ' + (err && err.message ? err.message : String(err)) }, '*');
          }
        }
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    })();
  </script>
</body>
</html>`;
}

export function buildSandboxHtml(rawCode = '', mode = 'live', options = {}) {
  return compileUniversalCode(rawCode, mode, options);
}
