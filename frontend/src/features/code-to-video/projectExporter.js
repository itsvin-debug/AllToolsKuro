/**
 * Kuro Studio - Editable Project & Multi-Editor Exporters
 * Menghasilkan proyek yang bisa diedit ulang di Alight Motion (.xml),
 * CapCut Mobile/Desktop (.zip), Final Cut Pro / DaVinci Resolve (.fcpxml .zip),
 * serta backup proyek internal studio (.kurovid.json).
 */

import JSZip from 'jszip';

export function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function sanitizeSlug(name = 'kuro-studio') {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'kuro-studio';
}

function pad2(n) {
  return String(Math.floor(n)).padStart(2, '0');
}

function pad3(n) {
  return String(Math.floor(n)).padStart(3, '0');
}

export function formatSrtTime(seconds = 0) {
  const safe = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms >= 1000 ? 999 : ms)}`;
}

/**
 * Menghasilkan file subtitle .srt standar untuk layer teks editable di CapCut & editor lain.
 */
export function generateSrtSubtitles(sceneGraph, duration = 10) {
  const cues = Array.isArray(sceneGraph?.subtitles) && sceneGraph.subtitles.length > 0
    ? sceneGraph.subtitles
    : [
        {
          startTime: 0.2,
          endTime: Math.max(1.5, duration - 0.2),
          text: sceneGraph?.entities?.headline || 'KURO STUDIO ANIMATION'
        }
      ];

  return cues
    .map((cue, idx) => {
      const start = formatSrtTime(cue.startTime);
      const end = formatSrtTime(Math.max(cue.startTime + 0.5, cue.endTime));
      return `${idx + 1}\n${start} --> ${end}\n${String(cue.text || '').trim()}\n`;
    })
    .join('\n');
}

/**
 * Fallback SceneGraph apabila user mengekspor dari Editor Kode bebas tanpa melalui Editor Teks.
 */
export function ensureEditableSceneGraph({ sceneGraph, settings = {}, title = 'Kuro Studio Project', duration = 10 }) {
  if (sceneGraph && Array.isArray(sceneGraph.layers) && sceneGraph.layers.length > 0) {
    return sceneGraph;
  }

  const headline = (settings.hudTitle || title || 'KURO STUDIO').trim();
  const subheadline = (settings.hudSubtitle || 'Karya Animasi Direct GPU & WebCodecs 60 FPS').trim();
  const accent = settings.accentColor || '#facc15';
  const bg = settings.bgColor1 || '#0b0b10';

  return {
    version: '2.0',
    duration,
    topic: 'general',
    topicLabel: 'Kode Animasi',
    palette: {
      name: 'Studio Default',
      bg1: bg,
      bg2: settings.bgColor2 || '#171726',
      accent,
      secondary: '#38bdf8',
      text: '#ffffff',
      muted: '#d4d4d8',
      isLight: false
    },
    entities: {
      brand: 'KURO STUDIO',
      headline,
      subheadline,
      keyPoints: ['Layer Teks Siap Edit', 'Ekspor Resolusi Penuh 60 FPS'],
      cta: 'DIEDIT DARI KURO STUDIO',
      promoPrice: '',
      oldPrice: '',
      channelLine: ''
    },
    layers: [
      { id: 'bg-stage', kind: 'background', startTime: 0, endTime: duration, color: bg },
      { id: 'text-headline', kind: 'headline', text: headline, startTime: 0.2, endTime: duration, x: 0.5, y: 0.35, fontSize: 56, color: '#ffffff' },
      { id: 'text-subheadline', kind: 'subheadline', text: subheadline, startTime: 0.5, endTime: duration, x: 0.5, y: 0.52, fontSize: 28, color: '#d4d4d8' },
      { id: 'text-cta', kind: 'cta', text: 'KURO STUDIO', startTime: 0.8, endTime: duration, x: 0.5, y: 0.84, fontSize: 24, color: '#09090b', bgColor: accent }
    ],
    subtitles: [
      { startTime: 0.2, endTime: Math.max(2, duration * 0.6), text: headline },
      { startTime: Math.max(2, duration * 0.6), endTime: duration, text: subheadline }
    ]
  };
}

/**
 * 1. ALIGHT MOTION EDITABLE (.xml)
 * Format XML AM kompatibel dengan vector shape, layer text terpisah, & keyframe transform.
 */
export function buildAlightMotionXmlString({ sceneGraph, width = 1280, height = 720, fps = 60, duration = 10, title = 'Kuro Studio' }) {
  const safeGraph = ensureEditableSceneGraph({ sceneGraph, title, duration });
  const totalMs = Math.max(1000, Math.round(duration * 1000));
  const pal = safeGraph.palette;
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);

  const shapeBackdrop = `  <shape id="101" label="Latar Utama" startTime="0" endTime="${totalMs}" fillType="color" fillColor="${escapeXml(pal.bg1)}">
    <transform>
      <location value="${cx}.0,${cy}.0,0.0" />
      <scale value="1.0,1.0" />
      <opacity value="1.0" />
    </transform>
    <property name="size" type="vec2" value="${width}.0,${height}.0" />
  </shape>
  <shape id="102" label="Aksen Garis Neon" startTime="0" endTime="${totalMs}" fillType="color" fillColor="${escapeXml(pal.accent)}">
    <transform>
      <location value="${cx}.0,${Math.round(height * 0.82)}.0,0.0" />
      <scale value="1.0,1.0" />
      <opacity value="0.9" />
    </transform>
    <property name="size" type="vec2" value="${Math.round(width * 0.72)}.0,6.0" />
  </shape>`;

  const textNodes = safeGraph.layers
    .filter((l) => l.text)
    .map((layer, index) => {
      const id = 200 + index;
      const startMs = Math.max(0, Math.round((layer.startTime || 0) * 1000));
      const endMs = Math.min(totalMs, Math.round((layer.endTime || duration) * 1000));
      const px = Math.round((layer.x ?? 0.5) * width);
      const py = Math.round((layer.y ?? 0.5) * height);
      const startPy = py + 45;
      const fontPx = Math.max(18, Math.round((layer.fontSize || 32) * (Math.min(width, height) / 720)));
      const textColor = layer.color || pal.text || '#ffffff';

      return `  <text id="${id}" label="${escapeXml(layer.kind || 'teks')}_${index + 1}" startTime="${startMs}" endTime="${endMs}" fillType="color" fillColor="${escapeXml(textColor)}">
    <content>${escapeXml(layer.text)}</content>
    <font name="Roboto-Bold" size="${fontPx}.0" align="center" />
    <transform>
      <location>
        <kf t="0.00" v="${px}.0,${startPy}.0,0.0" />
        <kf t="0.35" v="${px}.0,${py}.0,0.0" />
      </location>
      <scale>
        <kf t="0.00" v="0.86,0.86" />
        <kf t="0.35" v="1.00,1.00" />
      </scale>
      <opacity>
        <kf t="0.00" v="0.00" />
        <kf t="0.30" v="1.00" />
        <kf t="0.95" v="1.00" />
      </opacity>
    </transform>
  </text>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<scene title="${escapeXml(title)}" width="${width}" height="${height}" fps="${fps}" totalTime="${totalMs}" bgcolor="${escapeXml(pal.bg1)}" amver="1009000">
${shapeBackdrop}
${textNodes}
</scene>
`;
}

export function exportAlightMotionXML(params) {
  const xml = buildAlightMotionXmlString(params);
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const filename = `${sanitizeSlug(params.title || 'kuro-studio')}_alight-motion.xml`;
  return { blob, filename, content: xml };
}

/**
 * Helper Browser Canvas: Membuat sprite PNG transparan 32-bit untuk tiap layer teks
 */
export async function renderTransparentTextLayerPngs(sceneGraph, width = 1280, height = 720) {
  if (typeof document === 'undefined') return [];
  const safeGraph = ensureEditableSceneGraph({ sceneGraph });
  const pal = safeGraph.palette;
  const textLayers = safeGraph.layers.filter((l) => l.text);
  const assets = [];

  for (let i = 0; i < textLayers.length; i++) {
    const layer = textLayers[i];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const fontPx = Math.max(20, Math.round((layer.fontSize || 34) * (Math.min(width, height) / 720)));
    const py = Math.round((layer.y ?? 0.5) * height);
    const maxW = Math.round(width * 0.84);

    ctx.font = `900 ${fontPx}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (layer.kind === 'badge' || layer.kind === 'cta') {
      const boxW = Math.min(maxW, ctx.measureText(layer.text).width + fontPx * 2.2);
      const boxH = fontPx * 1.9;
      const bx = (width - boxW) * 0.5;
      const by = py - boxH * 0.5;
      ctx.fillStyle = layer.bgColor || pal.accent;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(bx, by, boxW, boxH, 12) : ctx.rect(bx, by, boxW, boxH);
      ctx.fill();
      ctx.fillStyle = layer.color || '#09090b';
      ctx.fillText(layer.text, width * 0.5, py, boxW - 20);
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = layer.color || pal.text;
      ctx.fillText(layer.text, width * 0.5, py, maxW);
    }

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      const safeKind = sanitizeSlug(layer.kind || 'layer');
      assets.push({
        id: layer.id || `layer_${i + 1}`,
        name: `${pad2(i + 1)}_${safeKind}.png`,
        blob,
        layer
      });
    }
  }

  return assets;
}

/**
 * 2. CAPCUT DRAFT CONTENT GENERATOR (JSON)
 */
export function buildCapCutDraftObjects({ title = 'Kuro Studio', width = 1280, height = 720, fps = 60, duration = 10, videoExt = 'mp4', sceneGraph }) {
  const safeGraph = ensureEditableSceneGraph({ sceneGraph, title, duration });
  const totalUs = Math.max(1_000_000, Math.round(duration * 1_000_000));
  const textLayers = safeGraph.layers.filter((l) => l.text);

  const textMaterials = textLayers.map((l, idx) => ({
    id: `text-mat-${idx + 1}`,
    type: 'text',
    content: JSON.stringify({
      text: l.text,
      styles: [{ range: [0, String(l.text).length], size: Math.round((l.fontSize || 32) * 0.45), bold: true, fill: { content: { solid: { color: [1, 1, 1] } } } }]
    }),
    text_color: l.color || '#ffffff',
    font_size: Math.round((l.fontSize || 32) * 0.45),
    alignment: 1
  }));

  const textSegments = textLayers.map((l, idx) => {
    const startUs = Math.max(0, Math.round((l.startTime || 0) * 1_000_000));
    const endUs = Math.min(totalUs, Math.round((l.endTime || duration) * 1_000_000));
    return {
      id: `text-seg-${idx + 1}`,
      material_id: `text-mat-${idx + 1}`,
      target_timerange: { start: startUs, duration: Math.max(200_000, endUs - startUs) },
      clip: { transform: { x: 0, y: Number((0.7 - (l.y ?? 0.5) * 1.4).toFixed(3)) } }
    };
  });

  const draftContent = {
    canvas_config: { width, height, ratio: 'custom' },
    fps,
    duration: totalUs,
    materials: {
      videos: [
        {
          id: 'vid-clean-bg',
          material_name: `02_Video_Latar_Polos_Tanpa_Teks.${videoExt}`,
          path: `02_Video_Latar_Polos_Tanpa_Teks.${videoExt}`,
          type: 'video',
          width,
          height,
          duration: totalUs
        }
      ],
      texts: textMaterials
    },
    tracks: [
      {
        id: 'track-video-main',
        type: 'video',
        segments: [
          {
            id: 'seg-bg-main',
            material_id: 'vid-clean-bg',
            source_timerange: { start: 0, duration: totalUs },
            target_timerange: { start: 0, duration: totalUs }
          }
        ]
      },
      {
        id: 'track-text-overlay',
        type: 'text',
        segments: textSegments
      }
    ]
  };

  const draftMeta = {
    draft_id: `kuro-${Date.now()}`,
    draft_name: title,
    tm_duration: totalUs,
    tm_draft_create: Date.now() * 1000,
    tm_draft_modified: Date.now() * 1000
  };

  return { draftContent, draftMeta };
}

export async function exportCapCutBundleZip({
  finalVideoBlob,
  cleanBgVideoBlob,
  videoExt = 'mp4',
  sceneGraph,
  title = 'Kuro Studio',
  width = 1280,
  height = 720,
  fps = 60,
  duration = 10
}) {
  const zip = new JSZip();
  const safeGraph = ensureEditableSceneGraph({ sceneGraph, title, duration });

  if (finalVideoBlob) {
    zip.file(`01_Video_Final_HD.${videoExt}`, finalVideoBlob);
  }
  if (cleanBgVideoBlob || finalVideoBlob) {
    zip.file(`02_Video_Latar_Polos_Tanpa_Teks.${videoExt}`, cleanBgVideoBlob || finalVideoBlob);
  }

  const pngLayers = await renderTransparentTextLayerPngs(safeGraph, width, height);
  const pngFolder = zip.folder('03_Overlay_Teks_Transparan_PNG');
  pngLayers.forEach((asset) => {
    pngFolder.file(asset.name, asset.blob);
  });

  const srtContent = generateSrtSubtitles(safeGraph, duration);
  zip.file('04_Teks_Editable_Timeline.srt', srtContent);

  const { draftContent, draftMeta } = buildCapCutDraftObjects({
    title,
    width,
    height,
    fps,
    duration,
    videoExt,
    sceneGraph: safeGraph
  });
  const draftFolder = zip.folder('05_CapCut_Desktop_Draft');
  draftFolder.file('draft_content.json', JSON.stringify(draftContent, null, 2));
  draftFolder.file('draft_meta_info.json', JSON.stringify(draftMeta, null, 2));

  const readme = [
    'PANDUAN EDIT ULANG DI CAPCUT (MOBILE & DESKTOP)',
    '================================================',
    '',
    '1. Cara Paling Mudah di CapCut HP / Mobile:',
    `   - Impor video polos "02_Video_Latar_Polos_Tanpa_Teks.${videoExt}" sebagai track utama.`,
    '   - Pilih menu Teks -> Impor Teks / Keterangan Otomatis dari file "04_Teks_Editable_Timeline.srt"',
    '     ATAU tambahkan stiker PNG dari folder "03_Overlay_Teks_Transparan_PNG/" sebagai Overlay.',
    '   - Sekarang kamu bebas mengganti font, ukuran, warna, posisi, dan animasi teks langsung di CapCut.',
    '',
    '2. Cara Buka Draft di CapCut Desktop (Windows / macOS):',
    '   - Salin seluruh isi folder "05_CapCut_Desktop_Draft" beserta video ke folder Draft CapCut.',
    '   - Relink file video ke "02_Video_Latar_Polos_Tanpa_Teks.' + videoExt + '" apabila diminta.',
    ''
  ].join('\n');
  zip.file('CARA_EDIT_DI_CAPCUT.txt', readme);

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${sanitizeSlug(title)}_capcut-bundle.zip`;
  return { blob, filename };
}

/**
 * 3. FCPXML v1.9 BUNDLE (.zip) UNTUK FINAL CUT PRO / DAVINCI RESOLVE / PREMIERE PRO
 */
export function buildFcpxmlString({ title = 'Kuro Studio', width = 1280, height = 720, fps = 60, duration = 10, videoExt = 'mp4', sceneGraph, pngAssets = [] }) {
  const safeGraph = ensureEditableSceneGraph({ sceneGraph, title, duration });
  const frameNum = Math.max(1, Math.round(duration * fps));
  const durStr = `${frameNum}/${fps}s`;
  const frameDur = `1/${fps}s`;

  const assetEntries = [
    `    <asset id="r2" name="Video_Final_HD" src="file://./assets/01_Video_Final_HD.${escapeXml(videoExt)}" start="0s" duration="${durStr}" hasVideo="1" format="r1" />`,
    `    <asset id="r3" name="Video_Latar_Polos" src="file://./assets/02_Video_Latar_Polos_Tanpa_Teks.${escapeXml(videoExt)}" start="0s" duration="${durStr}" hasVideo="1" format="r1" />`
  ];

  pngAssets.forEach((asset, idx) => {
    assetEntries.push(
      `    <asset id="r${10 + idx}" name="${escapeXml(asset.name)}" src="file://./assets/03_Overlay_Teks_Transparan_PNG/${escapeXml(asset.name)}" start="0s" duration="${durStr}" hasVideo="1" format="r1" />`
    );
  });

  const titleClips = safeGraph.layers
    .filter((l) => l.text)
    .map((layer, idx) => {
      const startF = Math.round((layer.startTime || 0) * fps);
      const endF = Math.max(startF + fps, Math.round((layer.endTime || duration) * fps));
      const clipDur = `${endF - startF}/${fps}s`;
      const offsetStr = `${startF}/${fps}s`;
      return `            <title lane="${idx + 1}" name="${escapeXml(layer.text.slice(0, 48))}" ref="rTitle" offset="${offsetStr}" duration="${clipDur}" start="0s">
              <text>
                <text-style ref="ts${idx + 1}">${escapeXml(layer.text)}</text-style>
              </text>
            </title>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat${width}x${height}p${fps}" frameDuration="${frameDur}" width="${width}" height="${height}" />
    <effect id="rTitle" name="Basic Title" uid=".../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti" />
${assetEntries.join('\n')}
  </resources>
  <library>
    <event name="Kuro Studio Event">
      <project name="${escapeXml(title)}">
        <sequence format="r1" duration="${durStr}" tcStart="0s" tcFormat="NDF">
          <spine>
            <asset-clip name="02_Video_Latar_Polos_Tanpa_Teks" ref="r3" offset="0s" duration="${durStr}" start="0s">
${titleClips}
            </asset-clip>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

export async function exportFcpxmlBundleZip({
  finalVideoBlob,
  cleanBgVideoBlob,
  videoExt = 'mp4',
  sceneGraph,
  title = 'Kuro Studio',
  width = 1280,
  height = 720,
  fps = 60,
  duration = 10
}) {
  const zip = new JSZip();
  const safeGraph = ensureEditableSceneGraph({ sceneGraph, title, duration });
  const pngLayers = await renderTransparentTextLayerPngs(safeGraph, width, height);

  const assetsFolder = zip.folder('assets');
  if (finalVideoBlob) {
    assetsFolder.file(`01_Video_Final_HD.${videoExt}`, finalVideoBlob);
  }
  if (cleanBgVideoBlob || finalVideoBlob) {
    assetsFolder.file(`02_Video_Latar_Polos_Tanpa_Teks.${videoExt}`, cleanBgVideoBlob || finalVideoBlob);
  }

  const pngFolder = assetsFolder.folder('03_Overlay_Teks_Transparan_PNG');
  pngLayers.forEach((asset) => {
    pngFolder.file(asset.name, asset.blob);
  });

  assetsFolder.file('04_Teks_Editable_Timeline.srt', generateSrtSubtitles(safeGraph, duration));

  const fcpxml = buildFcpxmlString({
    title,
    width,
    height,
    fps,
    duration,
    videoExt,
    sceneGraph: safeGraph,
    pngAssets: pngLayers
  });
  zip.file('project_timeline.fcpxml', fcpxml);
  zip.file(
    'CARA_IMPORT_FCPXML.txt',
    'Ekstrak zip ini terlebih dahulu lalu pilih File -> Import -> XML -> project_timeline.fcpxml di Final Cut Pro, DaVinci Resolve, atau Premiere Pro.'
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${sanitizeSlug(title)}_fcpxml-bundle.zip`;
  return { blob, filename };
}

/**
 * 4. BACKUP STUDIO PROJECT (.kurovid.json)
 */
export function exportKuroStudioProjectJson(payload = {}) {
  const data = {
    schema: 'kuro-studio-c2v-v1',
    exportedAt: new Date().toISOString(),
    editorTab: payload.editorTab || 'text',
    selectedTemplateId: payload.selectedTemplateId || 'promo-ad',
    universalCode: payload.universalCode || '',
    promptInput: payload.promptInput || '',
    promptOptions: payload.promptOptions || { visualStyle: 'auto', mood: 'auto' },
    settings: payload.settings || {},
    exportOptions: payload.exportOptions || { res: '1080p', aspect: '16:9', fps: 60, duration: 10, bitrate: 'high' }
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const filename = `kuro_project_${Date.now()}.kurovid.json`;
  return { blob, filename, content: json };
}

export function parseKuroStudioProjectJson(rawText = '') {
  const parsed = JSON.parse(rawText);
  if (!parsed || typeof parsed !== 'object' || parsed.schema !== 'kuro-studio-c2v-v1') {
    throw new Error('Berkas bukan format cadangan Kuro Studio (.kurovid.json) yang valid.');
  }
  return {
    editorTab: parsed.editorTab === 'code' ? 'code' : 'text',
    selectedTemplateId: typeof parsed.selectedTemplateId === 'string' ? parsed.selectedTemplateId : 'promo-ad',
    universalCode: typeof parsed.universalCode === 'string' ? parsed.universalCode : '',
    promptInput: typeof parsed.promptInput === 'string' ? parsed.promptInput : '',
    promptOptions: {
      visualStyle: parsed.promptOptions?.visualStyle || 'auto',
      mood: parsed.promptOptions?.mood || 'auto'
    },
    settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : null,
    exportOptions: parsed.exportOptions && typeof parsed.exportOptions === 'object' ? parsed.exportOptions : null
  };
}
