/**
 * Kuro Studio - Compositional 2D & 3D Procedural Canvas Motion Builder
 * Membangun video HTML5 Canvas 2D + proyeksi perspektif 3D deterministik 60 FPS
 * lengkap dengan aset produk akurat (Botol Soda/Kopi/Mangkuk/Browser/Device/Podium/3D),
 * lapisan atmosferik modular (pita gelombang, gelembung soda, es batu 3D, kabut embun),
 * serta proteksi anti-overflow teks pada semua rasio aspek.
 */

import { PROMPT_FONT_FAMILIES, PROMPT_TEXT_SCALES } from './textPromptCompiler.js';

export function buildProceduralSceneDocument(sceneGraph, cleanBgOnly = false) {
  const opts = sceneGraph.renderOptions || {};
  const fontDef = PROMPT_FONT_FAMILIES.find((f) => f.id === opts.fontFamily) || PROMPT_FONT_FAMILIES[0];
  const scaleDef = PROMPT_TEXT_SCALES.find((s) => s.id === opts.textScale) || PROMPT_TEXT_SCALES[1];

  const payload = {
    duration: sceneGraph.duration,
    designSystem: sceneGraph.designSystem,
    heroVisual: sceneGraph.heroVisual,
    visualLayers: sceneGraph.visualLayers || {},
    palette: sceneGraph.palette,
    scenes: sceneGraph.scenes,
    cleanBgOnly,
    opts: {
      bgPattern: opts.bgPattern || 'auto',
      cardStyle: opts.cardStyle || 'auto',
      sceneParticles: opts.sceneParticles || 'auto',
      fontCss: fontDef.css,
      textScaleFactor: scaleDef.factor,
      textAlign: opts.textAlign || 'left',
      showProgressBar: opts.showProgressBar !== false && sceneGraph.visualLayers?.bottomProgressBar !== false,
      showShimmer: opts.showShimmer !== false,
      showBrandBadge: opts.showBrandBadge !== false,
      showMetricCounters: opts.showMetricCounters !== false,
      motionEasing: opts.motionEasing || 'bouncy'
    }
  };

  const serialized = JSON.stringify(payload).replace(/<\/script>/gi, '<\\/script>');
  const docTitle = cleanBgOnly
    ? 'Latar Polos Tanpa Teks — Kuro Studio'
    : `${sceneGraph.entities?.brand || sceneGraph.entities?.headline || 'Motion Studio'} — Kuro Studio`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${String(docTitle).replace(/[<>&]/g, '')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: ${sceneGraph.palette.bg1}; }
    canvas { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
<canvas id="motionStage"></canvas>
<script>
(function() {
  var CFG = ${serialized};
  var canvas = document.getElementById('motionStage');
  var ctx = canvas.getContext('2d');

  function syncCanvasSize() {
    var w = window.innerWidth || window.__CTV_VIRTUAL_W__ || 1280;
    var h = window.innerHeight || window.__CTV_VIRTUAL_H__ || 720;
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  syncCanvasSize();
  window.addEventListener('resize', syncCanvasSize);

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function easeVal(t, mode) {
    var x = clamp01(t);
    var m = mode || CFG.opts.motionEasing || 'bouncy';
    if (m === 'smooth' || m === 'calm') {
      return 1 - Math.pow(1 - x, 3);
    }
    if (m === 'energetic') {
      return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
    }
    var c1 = 1.70158;
    var c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  function hexToRgba(hex, alpha) {
    var c = String(hex || '#38bdf8').replace('#', '');
    if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
    var r = parseInt(c.slice(0, 2), 16) || 0;
    var g = parseInt(c.slice(2, 4), 16) || 0;
    var b = parseInt(c.slice(4, 6), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function drawRoundRect(x, y, w, h, r) {
    var rad = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function resolveEffectiveCardStyle() {
    if (CFG.opts.cardStyle && CFG.opts.cardStyle !== 'auto') return CFG.opts.cardStyle;
    if (CFG.designSystem === 'neo-brutalist') return 'neo-brutalist';
    if (CFG.designSystem === 'glassmorphism' || CFG.visualLayers.frostMist) return 'frosted-glass';
    if (CFG.designSystem === 'cyber-neon' || CFG.designSystem === '3d-space') return 'neon';
    if (CFG.designSystem === 'warm-promo') return 'frosted-glass';
    return CFG.palette.isLight ? 'neo-brutalist' : 'frosted-glass';
  }

  function resolveEffectiveBgPattern() {
    if (CFG.opts.bgPattern && CFG.opts.bgPattern !== 'auto') return CFG.opts.bgPattern;
    if (CFG.visualLayers.dynamicRibbonWave) return 'waves';
    if (CFG.visualLayers.tiltedGrid || CFG.designSystem === 'neo-brutalist') return 'grid-tilted';
    if (CFG.visualLayers.perspectiveGrid3d || CFG.designSystem === 'cyber-neon' || CFG.designSystem === '3d-space') return 'grid-3d';
    if (CFG.designSystem === 'glassmorphism') return 'aurora';
    return 'waves';
  }

  function drawSmartWrappedText(text, x, y, maxW, maxH, baseFontSize, weight, align) {
    var clean = String(text || '').trim();
    if (!clean || maxW < 20 || maxH < 12) return 0;

    var family = CFG.opts.fontCss || "system-ui, -apple-system, 'Segoe UI', sans-serif";
    var scaleF = CFG.opts.textScaleFactor || 1.0;
    var maxSize = Math.max(12, Math.round(baseFontSize * scaleF));
    var minSize = Math.max(11, Math.round(maxSize * 0.45));
    var lineMult = 1.18;

    var chosenSize = minSize;
    var chosenLines = [clean];

    for (var s = maxSize; s >= minSize; s -= 2) {
      ctx.font = weight + ' ' + s + 'px ' + family;
      var words = clean.split(/\\s+/);
      var lines = [];
      var cur = '';

      for (var i = 0; i < words.length; i++) {
        var word = words[i];
        var test = cur ? (cur + ' ' + word) : word;
        if (ctx.measureText(test).width <= maxW) {
          cur = test;
        } else {
          if (cur) lines.push(cur);
          if (ctx.measureText(word).width > maxW) {
            var trimW = word;
            while (trimW.length > 3 && ctx.measureText(trimW + '...').width > maxW) {
              trimW = trimW.slice(0, -1);
            }
            cur = trimW + (trimW.length < word.length ? '...' : '');
          } else {
            cur = word;
          }
        }
      }
      if (cur) lines.push(cur);

      var neededH = lines.length * s * lineMult;
      if (neededH <= maxH) {
        chosenSize = s;
        chosenLines = lines;
        break;
      }
      if (s <= minSize + 1) {
        chosenSize = minSize;
        var cap = Math.max(1, Math.floor(maxH / (minSize * lineMult)));
        chosenLines = lines.slice(0, cap);
        if (lines.length > cap && chosenLines.length > 0) {
          var lastIdx = chosenLines.length - 1;
          var lastStr = chosenLines[lastIdx];
          while (lastStr.length > 3 && ctx.measureText(lastStr + '...').width > maxW) {
            lastStr = lastStr.slice(0, -1);
          }
          chosenLines[lastIdx] = lastStr + '...';
        }
      }
    }

    ctx.save();
    ctx.font = weight + ' ' + chosenSize + 'px ' + family;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    var step = chosenSize * lineMult;
    for (var l = 0; l < chosenLines.length; l++) {
      ctx.fillText(chosenLines[l], x, y + l * step, maxW);
    }
    ctx.restore();
    return chosenLines.length * step;
  }

  function drawKineticHeadline(text, x, y, maxW, maxH, baseFontSize, localT, pal, align) {
    var words = String(text || '').trim().split(/\\s+/);
    if (!words.length || !words[0]) return 0;
    var revealProg = clamp01(localT / 0.72);
    var revealedCount = Math.max(1, Math.ceil(revealProg * words.length));
    var visibleText = words.slice(0, revealedCount).join(' ');
    var settle = easeVal(clamp01(localT / 0.52), 'smooth');
    var liftY = (1 - settle) * 14;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * clamp01(localT / 0.22);
    if (!pal.isLight) {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 3;
    }
    ctx.fillStyle = pal.textPrimary || pal.text;
    var h = drawSmartWrappedText(visibleText, x, y + liftY, maxW, maxH, baseFontSize, '900', align);
    ctx.restore();
    return h;
  }

  function drawStyledCard(x, y, w, h, radius, styleMode, pal, tSweep, accentHex) {
    var acc = accentHex || pal.frostAccent || pal.accent;
    ctx.save();
    if (styleMode === 'neo-brutalist') {
      drawRoundRect(x + 6, y + 6, w, h, Math.min(12, radius));
      ctx.fillStyle = pal.border || '#0f172a';
      ctx.fill();

      drawRoundRect(x, y, w, h, Math.min(12, radius));
      ctx.fillStyle = pal.isLight ? '#ffffff' : '#111827';
      ctx.fill();
      ctx.strokeStyle = pal.border || '#0f172a';
      ctx.lineWidth = 3.2;
      ctx.stroke();

      ctx.fillStyle = acc;
      ctx.fillRect(x + 3, y + 3, 7, h - 6);
    } else if (styleMode === 'frosted-glass' || styleMode === 'glass') {
      drawRoundRect(x, y, w, h, radius);
      var gCard = ctx.createLinearGradient(x, y, x, y + h);
      if (pal.isLight) {
        gCard.addColorStop(0, 'rgba(255,255,255,0.82)');
        gCard.addColorStop(1, 'rgba(241,245,249,0.58)');
      } else {
        gCard.addColorStop(0, 'rgba(255,255,255,0.2)');
        gCard.addColorStop(1, 'rgba(255,255,255,0.07)');
      }
      ctx.fillStyle = gCard;
      ctx.fill();
      ctx.strokeStyle = pal.isLight ? 'rgba(15,23,42,0.18)' : 'rgba(255,255,255,0.34)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Specular inner top edge (efek kaca dingin)
      ctx.beginPath();
      ctx.moveTo(x + radius, y + 1.5);
      ctx.lineTo(x + w - radius, y + 1.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (styleMode === 'neon') {
      drawRoundRect(x, y, w, h, radius);
      ctx.fillStyle = 'rgba(7, 10, 26, 0.84)';
      ctx.fill();
      ctx.shadowColor = acc;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = acc;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      drawRoundRect(x, y, w, h, radius);
      ctx.fillStyle = pal.isLight ? 'rgba(241,245,249,0.92)' : 'rgba(15,23,42,0.58)';
      ctx.fill();
      ctx.strokeStyle = hexToRgba(pal.muted, 0.25);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    if (CFG.opts.showShimmer && tSweep >= 0 && tSweep <= 1.2) {
      ctx.save();
      drawRoundRect(x, y, w, h, styleMode === 'neo-brutalist' ? Math.min(12, radius) : radius);
      ctx.clip();
      var sx = x - w * 0.4 + tSweep * (w * 1.8);
      var grad = ctx.createLinearGradient(sx - 40, y, sx + 40, y + h);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, pal.isLight ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.22)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
    ctx.restore();
  }

  // Proyeksi & render kubus es kristal 3D berputar dengan sudut transparan berkilau
  function drawIceCube3D(cx, cy, r, rotY, rotX, tintHex, alpha) {
    var verts = [
      [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
      [-1,-1, 1],[1,-1, 1],[1,1, 1],[-1,1, 1]
    ];
    var faces = [
      [0,1,2,3], [4,5,6,7], [0,1,5,4],
      [2,3,7,6], [1,2,6,5], [0,3,7,4]
    ];
    var proj = [];
    for (var i = 0; i < verts.length; i++) {
      var x = verts[i][0], y = verts[i][1], z = verts[i][2];
      var x1 = x * Math.cos(rotY) - z * Math.sin(rotY);
      var z1 = x * Math.sin(rotY) + z * Math.cos(rotY);
      var y2 = y * Math.cos(rotX) - z1 * Math.sin(rotX);
      var z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX);
      var f = r / (2.6 - z2 * 0.45);
      proj.push([cx + x1 * f * 1.65, cy + y2 * f * 1.65, z2]);
    }
    ctx.save();
    ctx.globalAlpha = (ctx.globalAlpha || 1) * (alpha || 0.85);
    faces.sort(function(fa, fb) {
      var za = (proj[fa[0]][2] + proj[fa[1]][2] + proj[fa[2]][2] + proj[fa[3]][2]) * 0.25;
      var zb = (proj[fb[0]][2] + proj[fb[1]][2] + proj[fb[2]][2] + proj[fb[3]][2]) * 0.25;
      return za - zb;
    });
    for (var fi = 0; fi < faces.length; fi++) {
      var fc = faces[fi];
      ctx.beginPath();
      ctx.moveTo(proj[fc[0]][0], proj[fc[0]][1]);
      ctx.lineTo(proj[fc[1]][0], proj[fc[1]][1]);
      ctx.lineTo(proj[fc[2]][0], proj[fc[2]][1]);
      ctx.lineTo(proj[fc[3]][0], proj[fc[3]][1]);
      ctx.closePath();
      var lum = (fi + 1) / faces.length;
      ctx.fillStyle = hexToRgba(tintHex || '#e0f2fe', 0.14 + lum * 0.24);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.68)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ASET PROSEDURAL 2D & 3D MODULAR (SESUAI KONTEKS PROMPT)
  function drawHeroVisual(kind, cx, cy, size, localT, totalT, pal) {
    if (!kind || kind === 'none') return;
    ctx.save();
    var floatY = Math.sin(totalT * 2.0) * (size * 0.04);
    ctx.translate(cx, cy + floatY);

    if (kind === 'bottle-can-beverage') {
      var enterSc = Math.max(0.05, easeVal(localT / 0.6));
      ctx.scale(enterSc, enterSc);

      // Es batu kristal 3D melayang di belakang botol
      drawIceCube3D(-size * 0.72, size * 0.34, size * 0.28, totalT * 0.7, 0.5, pal.frostAccent || '#bae6fd', 0.72);
      drawIceCube3D(size * 0.68, -size * 0.28, size * 0.24, -totalT * 0.85, 0.8, pal.frostAccent || '#e0f2fe', 0.75);

      // Halo radial backlight hangat/merah di belakang botol
      var aura = ctx.createRadialGradient(0, 0, size * 0.1, 0, 0, size * 1.15);
      aura.addColorStop(0, hexToRgba(pal.bgGlow || pal.accent || '#ff4d4d', 0.55));
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.15, 0, Math.PI * 2);
      ctx.fill();

      // Siluet botol kaca kontur 3D
      var bw = size * 0.58;
      var bh = size * 1.78;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-bw * 0.18, -bh * 0.5);
      ctx.lineTo(bw * 0.18, -bh * 0.5);
      ctx.lineTo(bw * 0.23, -bh * 0.34);
      ctx.bezierCurveTo(bw * 0.48, -bh * 0.2, bw * 0.52, -bh * 0.04, bw * 0.45, bh * 0.08);
      ctx.bezierCurveTo(bw * 0.4, bh * 0.18, bw * 0.54, bh * 0.32, bw * 0.48, bh * 0.45);
      ctx.quadraticCurveTo(bw * 0.44, bh * 0.5, 0, bh * 0.5);
      ctx.quadraticCurveTo(-bw * 0.44, bh * 0.5, -bw * 0.48, bh * 0.45);
      ctx.bezierCurveTo(-bw * 0.54, bh * 0.32, -bw * 0.4, bh * 0.18, -bw * 0.45, bh * 0.08);
      ctx.bezierCurveTo(-bw * 0.52, -bh * 0.04, -bw * 0.48, -bh * 0.2, -bw * 0.23, -bh * 0.34);
      ctx.closePath();

      var bGrad = ctx.createLinearGradient(-bw * 0.5, -bh * 0.4, bw * 0.5, bh * 0.4);
      bGrad.addColorStop(0, '#450308');
      bGrad.addColorStop(0.32, pal.bgGlow || pal.accent || '#e10613');
      bGrad.addColorStop(0.68, pal.bg1 || '#b90710');
      bGrad.addColorStop(1, '#1a0104');
      ctx.fillStyle = bGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // Clip isi botol untuk label & kilau cahaya
      ctx.clip();
      // Pita merah label tengah
      ctx.fillStyle = pal.accent || '#e10613';
      ctx.fillRect(-bw * 0.6, -bh * 0.08, bw * 1.2, bh * 0.22);

      // Pita gelombang putih ikonik melintas di label botol
      ctx.beginPath();
      ctx.moveTo(-bw * 0.6, bh * 0.01);
      ctx.bezierCurveTo(-bw * 0.2, -bh * 0.06, bw * 0.2, bh * 0.09, bw * 0.6, -bh * 0.02);
      ctx.lineTo(bw * 0.6, bh * 0.05);
      ctx.bezierCurveTo(bw * 0.2, bh * 0.15, -bw * 0.2, 0, -bw * 0.6, bh * 0.07);
      ctx.closePath();
      ctx.fillStyle = pal.ribbonColor || '#ffffff';
      ctx.fill();

      // Kilatan specular kaca vertikal mengilap bergerak
      var glossX = -bw * 0.35 + ((totalT * 0.32) % 1.4) * bw * 0.65;
      var gloss = ctx.createLinearGradient(glossX - 18, -bh * 0.5, glossX + 18, bh * 0.5);
      gloss.addColorStop(0, 'rgba(255,255,255,0)');
      gloss.addColorStop(0.5, 'rgba(255,255,255,0.34)');
      gloss.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gloss;
      ctx.fillRect(-bw * 0.6, -bh * 0.5, bw * 1.2, bh);
      ctx.restore();

      // Tutup botol metalik bergerigi
      drawRoundRect(-bw * 0.22, -bh * 0.54, bw * 0.44, bh * 0.065, 5);
      ctx.fillStyle = pal.ribbonColor || '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = pal.accent || '#e10613';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Butiran embun air dingin berkilau pada bodi botol
      for (var d = 0; d < 14; d++) {
        var dx = (((d * 43) % 70) - 35) * 0.01 * bw;
        var dy = (((d * 71) % 76) - 32) * 0.01 * bh;
        var dr = 2 + (d % 3) * 1.4;
        ctx.beginPath();
        ctx.arc(dx, dy, dr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(224,242,254,0.68)';
        ctx.fill();
      }

      // Kubus es batu 3D di depan bawah kanan (depth parallax)
      drawIceCube3D(size * 0.54, size * 0.56, size * 0.32, totalT * 0.95, 0.35, pal.frostAccent || '#e0f2fe', 0.9);
      drawIceCube3D(-size * 0.56, size * 0.62, size * 0.24, -totalT * 0.65, 0.6, pal.frostAccent || '#bae6fd', 0.82);

    } else if (kind === 'coffee-cup') {
      var cupW = size * 0.78;
      var cupH = size * 1.18;
      // Sedotan miring
      ctx.save();
      ctx.strokeStyle = pal.highlight || '#fde047';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cupW * 0.1, -cupH * 0.78);
      ctx.lineTo(-cupW * 0.04, cupH * 0.2);
      ctx.stroke();
      ctx.restore();

      // Badan gelas berlapis
      ctx.beginPath();
      ctx.moveTo(-cupW * 0.5, -cupH * 0.36);
      ctx.lineTo(cupW * 0.5, -cupH * 0.36);
      ctx.lineTo(cupW * 0.36, cupH * 0.5);
      ctx.lineTo(-cupW * 0.36, cupH * 0.5);
      ctx.closePath();
      var cGrad = ctx.createLinearGradient(0, -cupH * 0.36, 0, cupH * 0.5);
      cGrad.addColorStop(0, pal.frostAccent || '#e0f2fe');
      cGrad.addColorStop(0.55, pal.accent || '#a16207');
      cGrad.addColorStop(1, '#451a03');
      ctx.fillStyle = cGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      drawIceCube3D(-cupW * 0.14, -cupH * 0.12, size * 0.2, totalT * 0.6, 0.4, '#e0f2fe', 0.75);
      drawIceCube3D(cupW * 0.16, -cupH * 0.04, size * 0.18, -totalT * 0.5, 0.7, '#ffffff', 0.75);

    } else if (kind === 'food-bowl') {
      // Mangkuk kuliner + uap panas (HANYA dipakai untuk prompt kuliner/bakso/mie)
      for (var wave = 0; wave < 3; wave++) {
        var ph = (totalT * 0.85 + wave * 0.33) % 1;
        ctx.beginPath();
        var sx = (wave - 1) * size * 0.24;
        for (var k = 0; k <= 10; k++) {
          var py = -size * 0.2 - k * (size * 0.05) - ph * size * 0.22;
          var px = sx + Math.sin(totalT * 4 + k * 0.6 + wave) * size * 0.06;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = hexToRgba(pal.highlight || pal.accent, (1 - ph) * 0.7);
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, size * 0.05, size * 0.62, 0, Math.PI);
      ctx.closePath();
      ctx.fillStyle = pal.isLight ? '#ffffff' : '#fef2f2';
      ctx.fill();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, size * 0.05, size * 0.58, size * 0.16, 0, 0, Math.PI * 2);
      ctx.fillStyle = pal.secondary;
      ctx.fill();

    } else if (kind === 'browser-ui-3d' || kind === 'browser-mockup') {
      var bw2 = size * 1.65;
      var bh2 = size * 1.15;
      var tilt = Math.sin(totalT * 1.2) * 0.025;
      ctx.rotate(tilt);
      var winScale = Math.max(0.01, easeVal(localT / 0.65));
      ctx.scale(winScale, winScale);

      drawRoundRect(-bw2 * 0.5 + 8, -bh2 * 0.5 + 8, bw2, bh2, 14);
      ctx.fillStyle = pal.border || '#0f172a';
      ctx.fill();

      drawRoundRect(-bw2 * 0.5, -bh2 * 0.5, bw2, bh2, 14);
      ctx.fillStyle = pal.isLight ? '#ffffff' : '#0f172a';
      ctx.fill();
      ctx.strokeStyle = pal.border || '#0f172a';
      ctx.lineWidth = 3.2;
      ctx.stroke();

      drawRoundRect(-bw2 * 0.5, -bh2 * 0.5, bw2, bh2 * 0.16, 12);
      ctx.fillStyle = pal.bg2;
      ctx.fill();
      var dotColors = ['#ef4444', '#fde047', '#22c55e'];
      for (var dd = 0; dd < 3; dd++) {
        ctx.beginPath();
        ctx.arc(-bw2 * 0.42 + dd * 16, -bh2 * 0.42, 4.8, 0, Math.PI * 2);
        ctx.fillStyle = dotColors[dd];
        ctx.fill();
        ctx.strokeStyle = pal.border || '#0f172a';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      var p1 = easeVal((localT - 0.18) / 0.45);
      var p2 = easeVal((localT - 0.34) / 0.45);
      var p3 = easeVal((localT - 0.5) / 0.45);
      if (p1 > 0.02) {
        drawRoundRect(-bw2 * 0.44, -bh2 * 0.27, bw2 * 0.22 * p1, bh2 * 0.64, 8);
        ctx.fillStyle = hexToRgba(pal.accent, 0.28);
        ctx.fill();
        ctx.strokeStyle = pal.border || pal.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (p2 > 0.02) {
        drawRoundRect(-bw2 * 0.17, -bh2 * 0.27, bw2 * 0.61 * p2, bh2 * 0.27, 8);
        ctx.fillStyle = pal.highlight || pal.accent;
        ctx.fill();
        ctx.strokeStyle = pal.border || pal.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (p3 > 0.02) {
        for (var g = 0; g < 2; g++) {
          var gx = -bw2 * 0.17 + g * (bw2 * 0.32);
          drawRoundRect(gx, bh2 * 0.05, bw2 * 0.29 * p3, bh2 * 0.32, 8);
          ctx.fillStyle = g === 0 ? hexToRgba(pal.secondary, 0.35) : hexToRgba(pal.accent, 0.4);
          ctx.fill();
          ctx.strokeStyle = pal.border || pal.accent;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

    } else if (kind === 'device-duo-3d' || kind === 'device-duo') {
      var lw = size * 1.45;
      var lh = size * 0.92;
      drawRoundRect(-lw * 0.55, -lh * 0.5, lw, lh, 10);
      ctx.fillStyle = pal.isLight ? '#0f172a' : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      drawRoundRect(-lw * 0.48, -lh * 0.42, lw * 0.86, lh * 0.78, 6);
      ctx.fillStyle = pal.bg2;
      ctx.fill();

      var pw = size * 0.52;
      var ph = size * 0.9;
      drawRoundRect(lw * 0.18, -lh * 0.18, pw, ph, 12);
      ctx.fillStyle = pal.isLight ? '#ffffff' : '#09090b';
      ctx.fill();
      ctx.strokeStyle = pal.border || pal.accent;
      ctx.lineWidth = 3;
      ctx.stroke();
      drawRoundRect(lw * 0.23, -lh * 0.08, pw * 0.78, ph * 0.28, 6);
      ctx.fillStyle = pal.accent;
      ctx.fill();

    } else if (kind === 'geometry-3d' || kind === '3d-geometry') {
      var pts = [[0, -1, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1], [0, 1, 0]];
      var edges = [[0,1],[0,2],[0,3],[0,4],[5,1],[5,2],[5,3],[5,4],[1,2],[2,3],[3,4],[4,1]];
      var ay = totalT * 0.85;
      var ax = 0.45 + Math.sin(totalT * 0.6) * 0.2;
      var proj = [];
      for (var i = 0; i < pts.length; i++) {
        var x0 = pts[i][0], y0 = pts[i][1], z0 = pts[i][2];
        var x1 = x0 * Math.cos(ay) - z0 * Math.sin(ay);
        var z1 = x0 * Math.sin(ay) + z0 * Math.cos(ay);
        var y2 = y0 * Math.cos(ax) - z1 * Math.sin(ax);
        var z2 = y0 * Math.sin(ax) + z1 * Math.cos(ax);
        var f = (size * 0.62) / (2.5 - z2 * 0.45);
        proj.push([x1 * f * 2.2, y2 * f * 2.2]);
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.85, size * 0.26, -0.25, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(pal.secondary, 0.75);
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2.8;
      for (var e = 0; e < edges.length; e++) {
        var a = proj[edges[e][0]];
        var b = proj[edges[e][1]];
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }

    } else if (kind === 'product-pedestal-3d') {
      // Podium 3D bercahaya + prisma produk berputar
      var podW = size * 1.15;
      var podH = size * 0.34;
      var cone = ctx.createLinearGradient(0, -size * 1.0, 0, size * 0.4);
      cone.addColorStop(0, 'rgba(255,255,255,0)');
      cone.addColorStop(1, hexToRgba(pal.accent || '#38bdf8', 0.28));
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(-podW * 0.22, -size * 0.95);
      ctx.lineTo(podW * 0.22, -size * 0.95);
      ctx.lineTo(podW * 0.5, size * 0.4);
      ctx.lineTo(-podW * 0.5, size * 0.4);
      ctx.closePath();
      ctx.fill();

      drawIceCube3D(0, -size * 0.14, size * 0.54, totalT * 0.75, 0.42, pal.accent || '#38bdf8', 0.92);

      ctx.beginPath();
      ctx.ellipse(0, size * 0.45, podW * 0.52, podH * 0.42, 0, 0, Math.PI * 2);
      ctx.fillStyle = pal.isLight ? '#0f172a' : 'rgba(255,255,255,0.22)';
      ctx.fill();
      ctx.strokeStyle = pal.accent || '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

    } else {
      // kinetic-pure: Aksen geometris orbit tipis berkelas
      ctx.rotate(totalT * 0.28);
      ctx.strokeStyle = hexToRgba(pal.accent, 0.45);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.68, 0, Math.PI * 1.35);
      ctx.stroke();
      ctx.strokeStyle = hexToRgba(pal.secondary, 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.46, Math.PI * 0.3, Math.PI * 1.65);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAnimatedBackground(t, W, H, pal) {
    var grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, pal.bg1);
    grad.addColorStop(1, pal.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Aura tengah menyala halus jika bgGlow aktif
    if (pal.bgGlow) {
      var cg = ctx.createRadialGradient(W * 0.65, H * 0.48, 20, W * 0.65, H * 0.48, Math.max(W, H) * 0.55);
      cg.addColorStop(0, hexToRgba(pal.bgGlow, 0.28));
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, W, H);
    }

    var pat = resolveEffectiveBgPattern();
    if (pat === 'grid-tilted') {
      ctx.save();
      ctx.translate(W * 0.5, H * 0.5);
      ctx.rotate(-0.18);
      ctx.strokeStyle = hexToRgba(pal.border || pal.accent, pal.isLight ? 0.075 : 0.1);
      ctx.lineWidth = 1.2;
      var step = Math.max(44, Math.round(Math.min(W, H) * 0.075));
      var shift = (t * 18) % step;
      for (var gx = -W; gx <= W; gx += step) {
        ctx.beginPath(); ctx.moveTo(gx + shift, -H); ctx.lineTo(gx + shift, H); ctx.stroke();
      }
      for (var gy = -H; gy <= H; gy += step) {
        ctx.beginPath(); ctx.moveTo(-W, gy + shift); ctx.lineTo(W, gy + shift); ctx.stroke();
      }
      ctx.restore();
    } else if (pat === 'grid-3d') {
      ctx.save();
      ctx.strokeStyle = hexToRgba(pal.accent, 0.22);
      ctx.lineWidth = 1;
      var hy = H * 0.56;
      for (var col = -12; col <= 12; col++) {
        ctx.beginPath();
        ctx.moveTo(W * 0.5 + col * W * 0.025, hy);
        ctx.lineTo(W * 0.5 + col * W * 0.16, H);
        ctx.stroke();
      }
      for (var r = 1; r <= 9; r++) {
        var prog = ((r / 9 + t * 0.15) % 1);
        var ry = hy + Math.pow(prog, 2) * (H - hy);
        ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(W, ry); ctx.stroke();
      }
      ctx.restore();
    } else if (pat === 'aurora') {
      for (var a = 0; a < 2; a++) {
        var cx = W * (0.3 + a * 0.4 + Math.sin(t * 0.5 + a) * 0.08);
        var cy = H * (0.35 + a * 0.25 + Math.cos(t * 0.4 + a) * 0.08);
        var rA = Math.max(W, H) * 0.45;
        var aGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, rA);
        aGrad.addColorStop(0, hexToRgba(a === 0 ? pal.accent : pal.secondary, 0.24));
        aGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = aGrad;
        ctx.fillRect(0, 0, W, H);
      }
    } else if (pat === 'waves') {
      ctx.save();
      var ribbonCol = pal.ribbonColor || pal.secondary || '#ffffff';
      ctx.strokeStyle = hexToRgba(ribbonCol, 0.22);
      ctx.lineWidth = 3;
      for (var wv = 0; wv < 3; wv++) {
        ctx.beginPath();
        var baseY = H * (0.34 + wv * 0.22);
        for (var wx = 0; wx <= W; wx += 24) {
          var wy = baseY + Math.sin(wx * 0.0065 + t * 1.5 + wv * 1.3) * (H * 0.055);
          if (wx === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Kabut dingin (frost mist) di bagian bawah kanvas bila diaktifkan prompt
    if (CFG.visualLayers.frostMist) {
      var mist = ctx.createLinearGradient(0, H * 0.65, 0, H);
      mist.addColorStop(0, 'rgba(224,242,254,0)');
      mist.addColorStop(1, hexToRgba(pal.frostAccent || '#bae6fd', 0.22));
      ctx.fillStyle = mist;
      ctx.fillRect(0, H * 0.65, W, H * 0.35);
    }
  }

  var particles = [];
  for (var p = 0; p < 42; p++) {
    particles.push({
      x: ((p * 67) % 100) / 100,
      y: ((p * 41) % 100) / 100,
      r: 2.2 + (p % 5) * 1.4,
      spd: 0.04 + (p % 6) * 0.018
    });
  }

  function drawSceneParticles(t, W, H, pal) {
    var pMode = CFG.opts.sceneParticles || 'auto';
    if (pMode === 'off') return;

    var isFizz = Boolean(CFG.visualLayers.fizzBubbles);
    if (pMode === 'auto') {
      if (isFizz) pMode = 'fizz-bubbles';
      else if (CFG.designSystem === 'warm-promo') pMode = 'fire-sparks';
      else if (CFG.designSystem === 'neo-brutalist' || CFG.designSystem === 'editorial-minimal') pMode = 'petals-stars';
      else pMode = 'light-dust';
    }

    ctx.save();
    for (var i = 0; i < particles.length; i++) {
      var pt = particles[i];
      var px = (pt.x + Math.sin(t * 0.8 + i) * 0.022) * W;
      var moveUp = isFizz || pMode === 'fire-sparks' || pMode === 'sparks' || pMode === 'fizz-bubbles';
      var py = (moveUp ? ((pt.y - t * pt.spd) % 1 + 1) % 1 : ((pt.y + t * pt.spd) % 1)) * H;
      ctx.beginPath();
      ctx.arc(px, py, pt.r, 0, Math.PI * 2);
      if (isFizz || pMode === 'fizz-bubbles') {
        ctx.fillStyle = hexToRgba(pal.frostAccent || '#ffffff', 0.16);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.52)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        ctx.fillStyle = hexToRgba(i % 2 === 0 ? pal.accent : pal.secondary, pal.isLight ? 0.28 : 0.45);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function renderBrandBadge(badgeText, x, y, maxW, align, pal, scaleAnim) {
    if (!badgeText || !CFG.opts.showBrandBadge) return 0;
    var fontPx = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * 0.024));
    ctx.save();
    ctx.font = '900 ' + fontPx + 'px ' + (CFG.opts.fontCss || 'system-ui');
    var padX = 16;
    var bw = Math.min(maxW, ctx.measureText(badgeText).width + padX * 2);
    var bh = fontPx * 2.05;
    var bx = align === 'center' ? (x - bw * 0.5) : x;
    var cx = bx + bw * 0.5;
    var cy = y + bh * 0.5;
    ctx.translate(cx, cy);
    ctx.scale(scaleAnim, scaleAnim);
    ctx.translate(-cx, -cy);

    var cardStyle = resolveEffectiveCardStyle();
    if (cardStyle === 'neo-brutalist') {
      drawRoundRect(bx + 3, y + 3, bw, bh, 8);
      ctx.fillStyle = pal.border || '#0f172a';
      ctx.fill();
      drawRoundRect(bx, y, bw, bh, 8);
      ctx.fillStyle = pal.badgeColor || pal.highlight || pal.accent;
      ctx.fill();
      ctx.strokeStyle = pal.border || '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
    } else {
      drawRoundRect(bx, y, bw, bh, bh * 0.5);
      ctx.fillStyle = hexToRgba(pal.badgeColor || pal.accent, pal.isLight ? 0.22 : 0.28);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = pal.isLight ? pal.border : '#ffffff';
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, bx + bw * 0.5, y + bh * 0.52, bw - 12);
    ctx.restore();
    return bh + 14;
  }

  function renderScene(scene, localT, totalT, W, H, pal) {
    var padX = Math.round(W * 0.055);
    var padTop = Math.round(H * 0.065);
    var safeW = W - padX * 2;
    var safeBottom = H - (CFG.opts.showProgressBar ? 28 : 16);
    var isPortrait = W / Math.max(1, H) < 1.15;
    var align = isPortrait ? 'center' : (CFG.opts.textAlign || 'left');
    var anchorX = align === 'center' ? W * 0.5 : padX;
    var cardStyle = resolveEffectiveCardStyle();
    var sweepProg = (localT % 2.8) / 1.4;

    if (scene.kind === 'HookHeroScene') {
      var hasHero = scene.heroVisual && scene.heroVisual !== 'none';
      var textW = (!isPortrait && hasHero) ? Math.round(safeW * 0.54) : safeW;
      var textX = isPortrait ? W * 0.5 : (align === 'center' && !hasHero ? W * 0.5 : padX);
      var textAlign = isPortrait ? 'center' : (hasHero ? 'left' : align);

      var cursorY = isPortrait ? (hasHero ? H * 0.48 : padTop + 12) : H * 0.16;
      if (hasHero && isPortrait) {
        drawHeroVisual(scene.heroVisual, W * 0.5, H * 0.26, Math.min(W * 0.24, H * 0.13), localT, totalT, pal);
      } else if (hasHero && !isPortrait) {
        drawHeroVisual(scene.heroVisual, W * 0.77, H * 0.5, Math.min(W * 0.17, H * 0.27), localT, totalT, pal);
      }

      var bScale = Math.max(0.05, easeVal(localT / 0.4));
      cursorY += renderBrandBadge(scene.badge, isPortrait ? W * 0.5 : (hasHero ? padX : anchorX), isPortrait && hasHero ? padTop : cursorY, textW, textAlign, pal, bScale);
      if (hasHero && isPortrait) cursorY = H * 0.48;

      var hUsed = drawKineticHeadline(scene.title, textX, cursorY, textW, safeBottom - cursorY - 60, isPortrait ? W * 0.064 : H * 0.076, localT, pal, textAlign);
      cursorY += hUsed + 14;

      if (scene.subtitle) {
        var subAlpha = easeVal((localT - 0.35) / 0.45);
        ctx.save();
        ctx.globalAlpha = ctx.globalAlpha * clamp01(subAlpha);
        ctx.fillStyle = pal.muted;
        drawSmartWrappedText(scene.subtitle, textX, cursorY, textW, Math.max(40, safeBottom - cursorY), isPortrait ? W * 0.036 : H * 0.036, '600', textAlign);
        ctx.restore();
      }
      return;
    }

    if (scene.kind === 'FeatureGridScene') {
      var curY = padTop;
      curY += renderBrandBadge(scene.badge, anchorX, curY, safeW, align, pal, 1);
      ctx.fillStyle = pal.textPrimary || pal.text;
      var titleUsed = drawSmartWrappedText(scene.title, anchorX, curY, safeW, H * 0.14, isPortrait ? W * 0.054 : H * 0.056, '900', align);
      curY += titleUsed + Math.round(H * 0.025);

      var cards = scene.cards || [];
      if (!cards.length) {
        if (scene.subtitle) {
          ctx.fillStyle = pal.muted;
          drawSmartWrappedText(scene.subtitle, anchorX, curY + 8, safeW, safeBottom - curY - 12, isPortrait ? W * 0.04 : H * 0.04, '700', align);
        }
        return;
      }
      var cols = isPortrait ? 1 : (cards.length <= 2 ? cards.length : 2);
      var rows = Math.ceil(cards.length / cols);
      var gapX = Math.round(W * 0.024);
      var gapY = Math.round(H * 0.025);
      var cardW = Math.floor((safeW - gapX * (cols - 1)) / cols);
      var availH = Math.max(80, safeBottom - curY - 12);
      var cardH = Math.min(Math.floor((availH - gapY * (rows - 1)) / rows), Math.round(H * 0.34));

      for (var c = 0; c < cards.length; c++) {
        var item = cards[c];
        var delay = 0.12 + c * 0.16;
        var pAnim = easeVal((localT - delay) / 0.42);
        if (pAnim <= 0.01) continue;

        var colIdx = c % cols;
        var rowIdx = Math.floor(c / cols);
        var cx = padX + colIdx * (cardW + gapX);
        var cy = curY + rowIdx * (cardH + gapY) + (1 - clamp01(pAnim)) * 22;

        ctx.save();
        ctx.globalAlpha = ctx.globalAlpha * clamp01(pAnim);
        drawStyledCard(cx, cy, cardW, cardH, 14, cardStyle, pal, sweepProg - c * 0.12, c % 2 === 0 ? pal.accent : pal.secondary);

        var innerX = cx + 22;
        var innerW = cardW - 36;
        var innerY = cy + Math.round(cardH * 0.16);
        ctx.fillStyle = pal.textPrimary || pal.text;
        var usedT = drawSmartWrappedText(item.title, innerX, innerY, innerW, cardH * 0.45, Math.min(26, cardH * 0.24), '900', 'left');
        if (item.desc) {
          ctx.fillStyle = pal.muted;
          drawSmartWrappedText(item.desc, innerX, innerY + usedT + 6, innerW, Math.max(20, cardH - usedT - cardH * 0.24), Math.min(18, cardH * 0.17), '600', 'left');
        }
        ctx.restore();
      }
      return;
    }

    if (scene.kind === 'PricingPromoScene') {
      var pCurY = padTop + 10;
      pCurY += renderBrandBadge(scene.discountBadge || scene.badge, W * 0.5, pCurY, safeW, 'center', pal, 1);
      ctx.fillStyle = pal.textPrimary || pal.text;
      pCurY += drawSmartWrappedText(scene.title, W * 0.5, pCurY, safeW, H * 0.14, isPortrait ? W * 0.056 : H * 0.06, '900', 'center') + 16;

      var hasNoteOrCta = Boolean(scene.promoNote || scene.cta);
      var boxW = Math.min(safeW, isPortrait ? W * 0.86 : W * 0.58);
      var boxH = Math.min(H * (hasNoteOrCta ? 0.36 : 0.42), safeBottom - pCurY - (hasNoteOrCta ? 90 : 20));
      var boxX = (W - boxW) * 0.5;
      var pop = Math.max(0.1, easeVal(localT / 0.48));

      ctx.save();
      ctx.translate(W * 0.5, pCurY + boxH * 0.5);
      ctx.scale(pop, pop);
      ctx.translate(-W * 0.5, -(pCurY + boxH * 0.5));
      drawStyledCard(boxX, pCurY, boxW, boxH, 16, cardStyle, pal, sweepProg, pal.accent);

      if (scene.oldPrice) {
        var oldFont = Math.round(boxH * 0.16);
        ctx.font = '700 ' + oldFont + 'px ' + (CFG.opts.fontCss || 'system-ui');
        ctx.fillStyle = pal.muted;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var oldY = pCurY + boxH * 0.28;
        ctx.fillText(scene.oldPrice, W * 0.5, oldY, boxW - 36);
        var strikeW = Math.min(boxW * 0.7, ctx.measureText(scene.oldPrice).width + 18);
        var strikeProg = clamp01((localT - 0.35) / 0.4);
        ctx.beginPath();
        ctx.moveTo(W * 0.5 - strikeW * 0.5, oldY + 4);
        ctx.lineTo(W * 0.5 - strikeW * 0.5 + strikeW * strikeProg, oldY - 4);
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.fillStyle = pal.isLight ? pal.border : (pal.badgeColor || '#fde047');
      ctx.font = '900 ' + Math.round(boxH * 0.3) + 'px ' + (CFG.opts.fontCss || 'system-ui');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(scene.promoPrice || 'PROMO SPESIAL', W * 0.5, pCurY + boxH * (scene.oldPrice ? 0.64 : 0.5), boxW - 32);
      ctx.restore();

      if (scene.cta) {
        var cBtnY = pCurY + boxH + 18;
        var cBtnText = scene.cta;
        ctx.save();
        ctx.font = '900 ' + Math.round(Math.min(W, H) * 0.025) + 'px ' + (CFG.opts.fontCss || 'system-ui');
        var cBtnW = Math.min(safeW - 24, Math.max(240, ctx.measureText(cBtnText).width + 48));
        var cBtnH = Math.round(Math.min(W, H) * 0.072);
        drawRoundRect((W - cBtnW) * 0.5, cBtnY, cBtnW, cBtnH, cBtnH * 0.5);
        ctx.fillStyle = pal.badgeColor || pal.highlight || '#fde047';
        ctx.fill();
        ctx.fillStyle = '#09090b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cBtnText, W * 0.5, cBtnY + cBtnH * 0.52, cBtnW - 20);
        ctx.restore();
      }
      return;
    }

    if (scene.kind === 'MetricStatsScene') {
      var mY = padTop + 12;
      mY += renderBrandBadge(scene.badge, W * 0.5, mY, safeW, 'center', pal, 1);
      ctx.fillStyle = pal.textPrimary || pal.text;
      mY += drawSmartWrappedText(scene.title, W * 0.5, mY, safeW, H * 0.16, isPortrait ? W * 0.052 : H * 0.056, '900', 'center') + 24;

      var mets = scene.metrics && scene.metrics.length ? scene.metrics : [{ value: '60 FPS', label: 'Kualitas Render' }];
      var mCols = isPortrait ? 1 : Math.min(3, mets.length);
      var mGap = 18;
      var mW = Math.floor((safeW - mGap * (mCols - 1)) / mCols);
      var mH = Math.min(H * 0.34, Math.max(95, (safeBottom - mY - 24) / Math.ceil(mets.length / mCols)));

      for (var mi = 0; mi < mets.length; mi++) {
        var met = mets[mi];
        var mDelay = 0.08 + mi * 0.14;
        var mAnim = easeVal((localT - mDelay) / 0.45);
        if (mAnim <= 0.01) continue;

        var mx = padX + (mi % mCols) * (mW + mGap);
        var myRow = mY + Math.floor(mi / mCols) * (mH + 14) + (1 - clamp01(mAnim)) * 20;
        ctx.save();
        ctx.globalAlpha = ctx.globalAlpha * clamp01(mAnim);
        drawStyledCard(mx, myRow, mW, mH, 14, cardStyle, pal, sweepProg - mi * 0.14, pal.accent);

        var numMatch = String(met.value).match(/^(\d+(?:\.\d+)?)(.*)$/);
        var displayVal = met.value;
        if (numMatch && CFG.opts.showMetricCounters) {
          var targetNum = parseFloat(numMatch[1]);
          var progN = easeVal(clamp01((localT - mDelay) / 0.85), 'smooth');
          var curNum = Math.round(targetNum * progN);
          displayVal = curNum + (numMatch[2] || '');
        }
        ctx.fillStyle = pal.isLight ? pal.border : pal.accent;
        drawSmartWrappedText(displayVal, mx + mW * 0.5, myRow + mH * 0.2, mW - 24, mH * 0.45, Math.min(48, mH * 0.34), '900', 'center');
        ctx.fillStyle = pal.muted;
        drawSmartWrappedText(met.label, mx + mW * 0.5, myRow + mH * 0.64, mW - 24, mH * 0.28, 18, '700', 'center');
        ctx.restore();
      }
      return;
    }

    if (scene.kind === 'ClosingCTAScene') {
      var cardCW = Math.min(safeW, isPortrait ? safeW : W * 0.78);
      var cardCH = Math.min(H * 0.62, safeBottom - padTop - 20);
      var cardCX = (W - cardCW) * 0.5;
      var cardCY = (H - cardCH) * 0.48;
      var enterPop = Math.max(0.1, easeVal(localT / 0.5));

      ctx.save();
      ctx.translate(W * 0.5, H * 0.5);
      ctx.scale(enterPop, enterPop);
      ctx.translate(-W * 0.5, -H * 0.5);

      drawStyledCard(cardCX, cardCY, cardCW, cardCH, 18, cardStyle, pal, sweepProg, pal.highlight || pal.accent);
      var insideY = cardCY + cardCH * 0.14;
      insideY += renderBrandBadge(scene.badge, W * 0.5, insideY, cardCW - 40, 'center', pal, 1);

      ctx.fillStyle = pal.textPrimary || pal.text;
      insideY += drawSmartWrappedText(scene.title, W * 0.5, insideY + 4, cardCW - 56, cardCH * 0.32, isPortrait ? W * 0.062 : H * 0.066, '900', 'center') + 14;

      var btnPulse = 1 + Math.sin(totalT * 4.2) * 0.025;
      var btnText = scene.cta || 'COBA SEKARANG →';
      ctx.font = '900 ' + Math.round(Math.min(W, H) * 0.028) + 'px ' + (CFG.opts.fontCss || 'system-ui');
      var btnW = Math.min(cardCW - 48, Math.max(220, ctx.measureText(btnText).width + 52));
      var btnH = Math.round(Math.min(W, H) * 0.078);
      var btnX = (W - btnW) * 0.5;
      var btnY = Math.min(cardCY + cardCH - btnH - 44, insideY + 10);

      ctx.save();
      ctx.translate(W * 0.5, btnY + btnH * 0.5);
      ctx.scale(btnPulse, btnPulse);
      ctx.translate(-W * 0.5, -(btnY + btnH * 0.5));
      if (cardStyle === 'neo-brutalist') {
        drawRoundRect(btnX + 4, btnY + 4, btnW, btnH, 10);
        ctx.fillStyle = pal.border || '#0f172a';
        ctx.fill();
        drawRoundRect(btnX, btnY, btnW, btnH, 10);
        ctx.fillStyle = pal.badgeColor || pal.highlight || pal.accent;
        ctx.fill();
        ctx.strokeStyle = pal.border || '#0f172a';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
      } else {
        drawRoundRect(btnX, btnY, btnW, btnH, btnH * 0.5);
        ctx.fillStyle = pal.badgeColor || pal.highlight || pal.accent;
        ctx.fill();
        ctx.fillStyle = '#09090b';
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btnText, W * 0.5, btnY + btnH * 0.52, btnW - 20);
      ctx.restore();

      if (scene.subtitle) {
        ctx.fillStyle = pal.muted;
        drawSmartWrappedText(scene.subtitle, W * 0.5, btnY + btnH + 14, cardCW - 48, 40, 18, '700', 'center');
      }
      ctx.restore();
      return;
    }

    // StoryNarrativeScene
    var sY = H * 0.18;
    var badgeSc = Math.max(0.05, easeVal(localT / 0.36));
    sY += renderBrandBadge(scene.badge, anchorX, sY, safeW, align, pal, badgeSc);
    var barProg = easeVal((localT - 0.1) / 0.42, 'smooth');
    ctx.fillStyle = pal.accent;
    ctx.fillRect(align === 'center' ? W * 0.5 - 36 * barProg : padX, sY + 4, 72 * barProg, 5);
    sY += 22;

    var mainHUsed = drawKineticHeadline(scene.title, anchorX, sY, safeW, H * 0.38, isPortrait ? W * 0.062 : H * 0.068, localT, pal, align);
    if (scene.subtitle) {
      var subAlphaSt = clamp01((localT - 0.32) / 0.42);
      var subLift = (1 - easeVal(subAlphaSt, 'smooth')) * 12;
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * subAlphaSt;
      ctx.fillStyle = pal.muted;
      drawSmartWrappedText(scene.subtitle, anchorX, sY + mainHUsed + 16 + subLift, safeW, safeBottom - (sY + mainHUsed + 24), isPortrait ? W * 0.036 : H * 0.036, '600', align);
      ctx.restore();
    }
  }

  function renderFrame(t) {
    syncCanvasSize();
    var W = canvas.width;
    var H = canvas.height;
    var pal = CFG.palette;
    var totalDur = Math.max(3, CFG.duration || 12);

    drawAnimatedBackground(t, W, H, pal);
    drawSceneParticles(t, W, H, pal);

    if (CFG.cleanBgOnly) {
      var firstHero = CFG.heroVisual;
      if (firstHero && firstHero !== 'none') {
        drawHeroVisual(firstHero, W * 0.72, H * 0.5, Math.min(W, H) * 0.24, t, t, pal);
      }
      return;
    }

    var scenes = CFG.scenes || [];
    var active = scenes[scenes.length - 1];
    for (var s = 0; s < scenes.length; s++) {
      if (t >= scenes[s].startTime && t < scenes[s].endTime) {
        active = scenes[s];
        break;
      }
    }
    if (!active) return;

    var localT = Math.max(0, t - active.startTime);
    var remain = Math.max(0, active.endTime - t);
    var outDuration = Math.min(0.32, active.duration * 0.18);
    var outProg = remain < outDuration ? (1 - remain / Math.max(0.01, outDuration)) : 0;

    ctx.save();
    if (outProg > 0) {
      ctx.globalAlpha = clamp01(1 - outProg);
      if (active.transition === 'zoom') {
        var sc = 1 + outProg * 0.08;
        ctx.translate(W * 0.5, H * 0.5);
        ctx.scale(sc, sc);
        ctx.translate(-W * 0.5, -H * 0.5);
      } else if (active.transition === 'slide' || active.transition === 'wipe') {
        ctx.translate(-outProg * W * 0.08, 0);
      }
    }
    renderScene(active, localT, t, W, H, pal);
    ctx.restore();

    if (CFG.opts.showProgressBar) {
      var pct = clamp01(t / totalDur);
      ctx.fillStyle = hexToRgba(pal.border || pal.text, 0.16);
      ctx.fillRect(0, H - 7, W, 7);
      ctx.fillStyle = pal.badgeColor || pal.accent;
      ctx.fillRect(0, H - 7, W * pct, 7);
    }
  }

  var tStart = performance.now();
  function loop(now) {
    var elapsedSec;
    if (typeof window.__ctvNowSec === 'number') {
      elapsedSec = window.__ctvNowSec;
    } else {
      elapsedSec = ((now - tStart) / 1000) % Math.max(3, CFG.duration || 12);
    }
    renderFrame(elapsedSec);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
</script>
</body>
</html>`;
}
