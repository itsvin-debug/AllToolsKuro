import axios from 'axios';

export const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
export const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

export const PLATFORM_NAMES = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  twitter: 'X (Twitter)',
  youtube: 'YouTube',
  facebook: 'Facebook',
  reddit: 'Reddit',
  pinterest: 'Pinterest',
  bilibili: 'Bilibili',
  douyin: 'Douyin',
  bandcamp: 'Bandcamp',
  threads: 'Threads',
  spotify: 'Spotify',
  appleMusic: 'Apple Music',
  pixiv: 'Pixiv',
  rednote: 'Rednote',
  terabox: 'Terabox',
  capcut: 'CapCut',
  soundcloud: 'SoundCloud'
};

export function cleanInputUrl(raw) {
  if (!raw) return '';
  let str = String(raw).trim().replace(/^\/+/, '');
  if (!str.startsWith('http://') && !str.startsWith('https://')) {
    str = 'https://' + str;
  }
  return str;
}

function hostMatches(host, domains) {
  return domains.some((d) => host === d || host.endsWith('.' + d));
}

export function detectPlatform(rawUrl) {
  const url = cleanInputUrl(rawUrl).toLowerCase();
  if (!url) return null;

  let host = '';
  try {
    host = new URL(url).hostname.replace(/\.$/, '');
  } catch {
    host = url.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  }

  if (hostMatches(host, ['tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com'])) return 'tiktok';
  if (hostMatches(host, ['instagram.com', 'instagr.am', 'ig.me'])) return 'instagram';
  if (hostMatches(host, ['twitter.com', 'x.com', 't.co', 'fxtwitter.com', 'vxtwitter.com'])) return 'twitter';
  if (hostMatches(host, ['youtube.com', 'youtu.be', 'music.youtube.com'])) return 'youtube';
  if (hostMatches(host, ['facebook.com', 'fb.watch', 'fb.com', 'fb.me'])) return 'facebook';
  if (hostMatches(host, ['reddit.com', 'redd.it'])) return 'reddit';
  if (host === 'pin.it' || /^(?:.+\.)?pinterest\.[a-z.]+$/i.test(host)) return 'pinterest';
  if (hostMatches(host, ['bilibili.com', 'bilibili.tv', 'b23.tv'])) return 'bilibili';
  if (hostMatches(host, ['douyin.com', 'iesdouyin.com', 'v.douyin.com'])) return 'douyin';
  if (hostMatches(host, ['bandcamp.com'])) return 'bandcamp';
  if (hostMatches(host, ['threads.net', 'threads.com'])) return 'threads';
  if (hostMatches(host, ['spotify.com', 'spotify.link', 'spoti.fi'])) return 'spotify';
  if (hostMatches(host, ['music.apple.com'])) return 'appleMusic';
  if (hostMatches(host, ['pixiv.net'])) return 'pixiv';
  if (hostMatches(host, ['xiaohongshu.com', 'xhslink.com'])) return 'rednote';
  if (hostMatches(host, ['terabox.com', '1024tera.com', '1024terabox.com', 'teraboxapp.com', 'teraboxlink.com'])) return 'terabox';
  if (hostMatches(host, ['capcut.com', 'capcut.link'])) return 'capcut';
  if (hostMatches(host, ['soundcloud.com', 'on.soundcloud.com', 'snd.sc'])) return 'soundcloud';
  return null;
}

export async function resolveShortRedirectUrl(rawUrl, ua = UA_DESKTOP) {
  const url = cleanInputUrl(rawUrl);
  const needsResolve =
    /vt\.tiktok\.com|vm\.tiktok\.com|pin\.it|fb\.watch|fb\.me|t\.co|b23\.tv|v\.douyin\.com|xhslink\.com|redd\.it|instagr\.am|ig\.me|on\.soundcloud\.com|spotify\.link|spoti\.fi|capcut\.link|\/share\//i.test(url);
  if (!needsResolve) return url;

  try {
    const res = await axios.get(url, {
      maxRedirects: 8,
      headers: { 'User-Agent': ua },
      validateStatus: () => true,
      timeout: 7000
    });
    const resolved = res.request?.res?.responseUrl || res.config?.url;
    if (resolved && /^https?:\/\//i.test(resolved)) {
      return resolved;
    }
    const loc = res.headers?.location;
    if (loc && /^https?:\/\//i.test(loc)) {
      return loc;
    }
  } catch (e) {
    const loc = e?.response?.headers?.location;
    if (loc && /^https?:\/\//i.test(loc)) return loc;
  }
  return url;
}

function parseDurationSec(dur) {
  if (typeof dur === 'number' && Number.isFinite(dur)) return Math.max(0, Math.round(dur));
  if (!dur || typeof dur !== 'string') return 0;
  const trimmed = dur.trim();
  if (/^\d+s$/i.test(trimmed)) return parseInt(trimmed, 10) || 0;
  const parts = trimmed.split(':').map((n) => parseInt(n, 10));
  if (parts.length === 2 && !parts.some(Number.isNaN)) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && !parts.some(Number.isNaN)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function inferMimeFromFormat(fmt) {
  const f = String(fmt || 'mp4').toLowerCase();
  if (f === 'mp4') return 'video/mp4';
  if (f === 'webm') return 'video/webm';
  if (f === 'mp3') return 'audio/mpeg';
  if (f === 'm4a') return 'audio/mp4';
  if (f === 'png') return 'image/png';
  if (f === 'webp') return 'image/webp';
  if (f === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function parseQualityRank(item) {
  const str = `${item?.id || ''} ${item?.quality || ''} ${item?.label || ''}`.toLowerCase();
  if (str.includes('2160') || str.includes('4k')) return 2160;
  if (str.includes('1440') || str.includes('2k')) return 1440;
  if (str.includes('1080')) return 1080;
  if (str.includes('720')) return 720;
  if (str.includes('480')) return 480;
  if (str.includes('360')) return 360;
  if (item?.type === 'image' || item?.type === 'photo') return 1080;
  return 720;
}

/**
 * Normalisasi seluruh hasil ekstraksi menjadi schema seragam (slides[] + audioVariants[])
 * sambil tetap mempertahankan field kompatibel untuk UI & Gallery.
 */
export function attachNormalizedSchema(data, canonicalPlatform) {
  if (!data || typeof data !== 'object') return data;

  const normalizedPlatform = String(canonicalPlatform || data.platform || 'media').toLowerCase();
  const slides = [];

  const photos = Array.isArray(data.photos) ? data.photos : [];
  const videoSlides = Array.isArray(data.videoSlides) ? data.videoSlides : [];
  const links = Array.isArray(data.downloadLinks) ? data.downloadLinks : [];
  const wallpapers = Array.isArray(data.liveWallpapers) ? data.liveWallpapers : [];

  const videoLinks = links.filter((l) => l.type === 'video' && !String(l.id || '').includes('slide'));
  const gifLinks = links.filter((l) => l.type === 'gif' || l.extension === 'gif');
  const audioLinks = links.filter((l) => l.type === 'audio');

  // Slide Foto / GIF
  photos.forEach((p, idx) => {
    const ext = String(p.extension || (p.url?.includes('.gif') ? 'gif' : p.url?.includes('.png') ? 'png' : 'jpg')).toLowerCase();
    const isGif = p.type === 'gif' || ext === 'gif' || p.mediaType === 'gif';
    slides.push({
      index: slides.length,
      mediaType: isGif ? 'gif' : 'image',
      previewUrl: p.url,
      thumbnailUrl: p.thumbnail || p.url,
      variants: [{
        id: String(p.id || `photo_${idx + 1}`),
        label: p.label || (isGif ? 'GIF Asli' : `Foto Original #${idx + 1}`),
        qualityRank: parseQualityRank(p),
        format: ext,
        mimeType: inferMimeFromFormat(ext),
        url: p.url,
        fileSize: Number(p.fileSize) || 0,
        noWatermark: true
      }]
    });
  });

  // Video Slides (carousel campuran)
  videoSlides.forEach((v, idx) => {
    const ext = String(v.extension || 'mp4').toLowerCase();
    slides.push({
      index: slides.length,
      mediaType: 'video',
      previewUrl: v.streamUrl || v.url,
      thumbnailUrl: v.thumbnail || data.thumbnail || v.url,
      variants: [{
        id: String(v.id || `videoslide_${idx + 1}`),
        label: v.label || `Video Slide #${idx + 1}`,
        qualityRank: parseQualityRank(v),
        format: ext,
        mimeType: inferMimeFromFormat(ext),
        url: v.url,
        fileSize: Number(v.fileSize) || 0,
        noWatermark: true
      }]
    });
  });

  // GIF standalone atau Video Reguler (Multi-resolusi urut tertinggi -> terendah)
  if (slides.length === 0 && (videoLinks.length > 0 || gifLinks.length > 0)) {
    const mediaList = gifLinks.length > 0 && videoLinks.length === 0 ? gifLinks : videoLinks;
    const isGif = mediaList[0]?.type === 'gif' || mediaList[0]?.extension === 'gif' || Boolean(mediaList[0]?.isGif);
    const variants = mediaList
      .map((v, idx) => {
        const ext = String(v.extension || (isGif ? 'gif' : 'mp4')).toLowerCase();
        return {
          id: String(v.id || `v_${idx}`),
          label: v.label || v.quality || 'HD Video',
          qualityRank: parseQualityRank(v),
          format: ext,
          mimeType: inferMimeFromFormat(ext),
          url: v.url,
          fileSize: Number(v.fileSize) || 0,
          noWatermark: v.noWatermark !== false
        };
      })
      .sort((a, b) => b.qualityRank - a.qualityRank);

    slides.push({
      index: 0,
      mediaType: isGif ? 'gif' : 'video',
      previewUrl: mediaList[0]?.streamUrl || mediaList[0]?.url,
      thumbnailUrl: data.thumbnail || mediaList[0]?.url,
      variants
    });
  }

  // Live Wallpaper / Live Photo
  wallpapers.forEach((w, idx) => {
    const ext = String(w.extension || 'mp4').toLowerCase();
    slides.push({
      index: slides.length,
      mediaType: 'live_photo',
      previewUrl: w.streamUrl || w.url,
      thumbnailUrl: data.thumbnail || w.url,
      variants: [{
        id: String(w.id || `live_${idx + 1}`),
        label: w.label || 'Live Photo / Wallpaper',
        qualityRank: 1080,
        format: ext,
        mimeType: inferMimeFromFormat(ext),
        url: w.url,
        fileSize: Number(w.fileSize) || 0,
        noWatermark: true
      }]
    });
  });

  const audioVariants = audioLinks.map((a, idx) => ({
    id: String(a.id || `audio_${idx + 1}`),
    label: a.label || 'Audio MP3 (Original)',
    format: String(a.extension || 'mp3').toLowerCase(),
    mimeType: inferMimeFromFormat(a.extension || 'mp3'),
    url: a.url,
    fileSize: Number(a.fileSize) || 0
  }));

  return {
    ...data,
    platform: normalizedPlatform,
    platformKey: normalizedPlatform,
    platformName: PLATFORM_NAMES[canonicalPlatform] || data.platform || normalizedPlatform,
    durationSec: parseDurationSec(data.durationSec ?? data.duration),
    isCarousel: slides.length > 1 || Boolean(data.isSlide),
    slides,
    audioVariants
  };
}
