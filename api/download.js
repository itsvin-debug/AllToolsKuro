import axios from 'axios';
import * as cheerio from 'cheerio';
import { validateRequestSecurity } from './_security.js';

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const SAVENOW_API_KEY = 'dfcb6d76f2f6a9894gjkege8a4ab232222';

function cleanInputUrl(raw) {
  if (!raw) return '';
  let str = raw.trim();
  str = str.replace(/^\/+/, '');
  if (!str.startsWith('http://') && !str.startsWith('https://')) {
    str = 'https://' + str;
  }
  return str;
}

function detectPlatform(rawUrl) {
  const url = cleanInputUrl(rawUrl).toLowerCase();
  if (/tiktok\.com|vt\.tiktok\.com/i.test(url)) return 'tiktok';
  if (/instagram\.com|instagr\.am/i.test(url)) return 'instagram';
  if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/facebook\.com|fb\.watch|fb\.com/i.test(url)) return 'facebook';
  if (/reddit\.com|redd\.it/i.test(url)) return 'reddit';
  if (/pinterest\.com|pin\.it/i.test(url)) return 'pinterest';
  if (/bilibili\.com|b23\.tv/i.test(url)) return 'bilibili';
  if (/douyin\.com|iesdouyin\.com/i.test(url)) return 'douyin';
  if (/bandcamp\.com/i.test(url)) return 'bandcamp';
  if (/threads\.net/i.test(url)) return 'threads';
  if (/spotify\.com/i.test(url)) return 'spotify';
  if (/music\.apple\.com/i.test(url)) return 'appleMusic';
  if (/pixiv\.net/i.test(url)) return 'pixiv';
  if (/xiaohongshu\.com|xhslink\.com/i.test(url)) return 'rednote';
  if (/terabox\.com|1024tera\.com|teraboxapp\.com/i.test(url)) return 'terabox';
  return null;
}

// Fallback via SaveNow API.
async function scrapeViaSaveNow(targetUrl, formatList = ['2160', '1080', '720', 'mp3'], defaultTitle = 'Media Video', fallbackAuthor = 'Creator') {
  try {
    const initPromises = formatList.map(async fmt => {
      try {
        const apiUrl = `https://p.savenow.to/api/v2/download?format=${fmt}&url=${encodeURIComponent(targetUrl)}&apikey=${SAVENOW_API_KEY}`;
        const res = await axios.get(apiUrl, {
          headers: { 'User-Agent': UA_DESKTOP, 'Referer': 'https://y2down.cc/' },
          timeout: 6000
        });
        return {
          format: fmt,
          progressUrl: res.data?.progress_url,
          downloadUrl: res.data?.download_url,
          title: res.data?.title,
          thumbnail: res.data?.thumbnail_url || res.data?.info?.image
        };
      } catch (e) {
        return { format: fmt, error: e.message };
      }
    });

    const activeTasks = await Promise.all(initPromises);
    const validTasks = activeTasks.filter(t => t.progressUrl || t.downloadUrl);

    if (validTasks.length > 0) {
      // Tunggu hingga 3 iterasi singkat (maksimal 2.4 detik) agar link yang cepat langsung ready
      const pollPromises = validTasks.map(async task => {
        let finalUrl = task.downloadUrl || null;
        if (!finalUrl && task.progressUrl) {
          for (let i = 0; i < 3; i++) {
            await new Promise(r => setTimeout(r, 800));
            try {
              const progRes = await axios.get(task.progressUrl, {
                headers: { 'User-Agent': UA_DESKTOP, 'Referer': 'https://y2down.cc/' },
                timeout: 3000
              });
              if (progRes.data?.download_url) {
                finalUrl = progRes.data.download_url;
                break;
              }
            } catch (_) {}
          }
        }

        const effectiveUrl = finalUrl || task.progressUrl; 
        const isAudio = task.format === 'mp3';
        const is4k = task.format === '2160';
        const is1080 = task.format === '1080';

        return {
          id: isAudio ? 'audio' : is4k ? '2160p' : is1080 ? '1080p' : '720p',
          label: isAudio 
            ? 'Audio MP3 (Ekstrak Suara)' 
            : is4k 
            ? '4K Ultra HD (2160p Jernih Maksimal)' 
            : is1080 
            ? 'Resolusi HD 1080p (Status WA Anti-Burik)' 
            : 'Resolusi HD 720p (Standar Cepat)',
          quality: isAudio 
            ? '128kbps (Original Sound)' 
            : is4k 
            ? '4K Ultra HD (2160p)' 
            : is1080 
            ? '1080p (Full HD)' 
            : '720p (Standard HD)',
          url: effectiveUrl,
          type: isAudio ? 'audio' : 'video',
          extension: isAudio ? 'mp3' : 'mp4',
          filename: `media_${Date.now()}_${task.format}.${isAudio ? 'mp3' : 'mp4'}`
        };
      });

      const resolved = (await Promise.all(pollPromises)).filter(Boolean);
      if (resolved.length > 0) {
        const video4k = resolved.find(r => r.id === '2160p');
        const video1080 = resolved.find(r => r.id === '1080p');
        const video720 = resolved.find(r => r.id === '720p');
        const audioMp3 = resolved.find(r => r.type === 'audio');

        const masterVideo = video4k || video1080 || video720;
        const downloadLinks = [];
        if (masterVideo) {
          downloadLinks.push(video4k || {
            ...masterVideo,
            id: '2160p',
            label: '4K Ultra HD (2160p Jernih Maksimal)',
            quality: '4K Ultra HD (2160p)',
            filename: `media_${Date.now()}_4k.mp4`
          });
          downloadLinks.push(video1080 || {
            ...masterVideo,
            id: '1080p',
            label: 'Resolusi HD 1080p (Status WA Anti-Burik)',
            quality: '1080p (Full HD)',
            filename: `media_${Date.now()}_1080p.mp4`
          });
          downloadLinks.push(video720 || {
            ...masterVideo,
            id: '720p',
            label: 'Resolusi HD 720p (Standar Cepat)',
            quality: '720p (Standard HD)',
            filename: `media_${Date.now()}_720p.mp4`
          });
        }
        if (audioMp3) downloadLinks.push(audioMp3);

        const firstValid = validTasks.find(t => t.title);
        const title = firstValid?.title || defaultTitle;
        const thumbnail = firstValid?.thumbnail || null;

        return {
          title,
          author: fallbackAuthor,
          thumbnail,
          downloadLinks,
          musicInfo: { title, author: fallbackAuthor }
        };
      }
    }
  } catch (_) {}
  return null;
}

// Unshorten link jika vt.tiktok.com
async function resolveTikTokUrl(rawUrl) {
  let url = cleanInputUrl(rawUrl);
  if (url.includes('vt.tiktok.com') || url.includes('vm.tiktok.com')) {
    try {
      const head = await axios.get(url, {
        maxRedirects: 8,
        headers: {
          'User-Agent': UA_MOBILE
        },
        timeout: 6000
      });
      const resolved = head.request?.res?.responseUrl || head.config?.url;
      if (resolved && resolved.includes('tiktok.com') && (resolved.includes('/video/') || resolved.includes('/photo/') || resolved.includes('/@'))) {
        return resolved;
      }
    } catch (e) {
      const loc = e.response?.headers?.location;
      if (loc && (loc.includes('/video/') || loc.includes('/photo/') || loc.includes('/@'))) {
        return loc;
      }
    }
  }
  return url;
}

// Strategi 1: Tikmate API (Kecepatan tinggi, tanpa watermark, resolusi HD)
async function downloadViaTikmate(targetUrl) {
  try {
    const res = await axios.post('https://api.tikmate.app/api/lookup', new URLSearchParams({ url: targetUrl }), {
      headers: {
        'User-Agent': UA_DESKTOP,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 10000
    });

    if (res.data && res.data.success && res.data.id && res.data.token) {
      const item = res.data;
      const id = item.id;
      const token = item.token;
      const hdToken = item.hd_token || token;
      const standardUrl = `https://tikmate.app/download/${token}/${id}.mp4`;
      const hdUrl = `https://tikmate.app/download/${hdToken}/${id}.mp4?hd=1`;

      const downloadLinks = [
        {
          id: '2160p',
          label: '4K Ultra HD (2160p Jernih Maksimal)',
          quality: '4K Ultra HD (2160p)',
          url: hdUrl,
          type: 'video',
          extension: 'mp4',
          filename: `tiktok_${id}_4k.mp4`
        },
        {
          id: '1080p',
          label: 'Resolusi HD 1080p (Status WA Anti-Burik)',
          quality: '1080p (Full HD)',
          url: hdUrl,
          type: 'video',
          extension: 'mp4',
          filename: `tiktok_${id}_1080p.mp4`
        },
        {
          id: '720p',
          label: 'Resolusi HD 720p (Standar Cepat)',
          quality: '720p (Standard HD)',
          url: standardUrl,
          type: 'video',
          extension: 'mp4',
          filename: `tiktok_${id}_720p.mp4`
        },
        {
          id: 'audio',
          label: 'Audio MP3 (Original Sound)',
          quality: '128kbps (Original Audio)',
          url: standardUrl,
          type: 'audio',
          extension: 'mp3',
          filename: `tiktok_audio_${id}.mp3`
        }
      ];

      // Opsi live wallpaper tambahan untuk video jika tersedia dynamic cover
      if (item.dynamic_cover) {
        const isMp4 = item.dynamic_cover.includes('.mp4');
        downloadLinks.push({
          id: 'wallpaper',
          label: 'Live Wallpaper (Animasi Loop)',
          quality: 'Animasi Dynamic Loop',
          url: item.dynamic_cover,
          type: 'live_wallpaper',
          extension: isMp4 ? 'mp4' : 'webp',
          filename: `tiktok_${id}_wallpaper.${isMp4 ? 'mp4' : 'webp'}`
        });
      }

      return {
        success: true,
        platform: 'TikTok',
        contentType: 'video',
        mediaType: 'video',
        isSlide: false,
        id,
        title: item.desc || 'TikTok Video',
        author: item.author_name || item.author_id || 'TikTok Creator',
        thumbnail: item.cover || item.dynamic_cover || null,
        duration: null,
        photos: [],
        hasPhotos: false,
        videoSlides: [],
        hasVideoSlides: false,
        liveWallpapers: [],
        hasLiveWallpapers: false,
        downloadLinks,
        musicInfo: {
          title: item.desc || 'Original Sound',
          author: item.author_name || 'TikTok Creator',
          url: standardUrl
        }
      };
    }
  } catch (err) {
    console.warn('Tikmate lookup error:', err.message);
  }
  return null;
}

// TikTok scraper.
async function downloadTikTok(rawUrl) {
  let lastError = null;
  const url = await resolveTikTokUrl(rawUrl);

  // Strategi 1: Tikmate API
  try {
    const tikmateRes = await downloadViaTikmate(url);
    if (tikmateRes) return tikmateRes;
  } catch (err) {
    lastError = err;
  }

  // TikWM API.
  try {
    const res = await axios.post('https://www.tikwm.com/api/', new URLSearchParams({
      url: url,
      count: '12',
      cursor: '0',
      web: '1',
      hd: '1'
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': UA_DESKTOP,
        'Referer': 'https://www.tikwm.com/'
      },
      timeout: 8000
    });

    const data = res.data;
    if (data?.code === 0 && data.data) {
      const item = data.data;
      const base = 'https://www.tikwm.com';

      if (item.images && Array.isArray(item.images) && item.images.length > 0) {
        const photos = item.images.map((imgUrl, idx) => {
          const fullImg = imgUrl.startsWith('http') 
            ? imgUrl 
            : (imgUrl.startsWith('//') ? `https:${imgUrl}` : `${base}${imgUrl}`);
          return {
            id: idx + 1,
            label: `Foto Slide #${idx + 1}`,
            quality: 'HD 1080p Image',
            url: fullImg,
            type: 'image',
            extension: 'jpg',
            filename: `tiktok_slide_${item.id || Date.now()}_${idx + 1}.jpg`
          };
        });

        // Ekstraksi video slide (video kompilasi slideshow) jika tersedia
        const rawSlideVideo = item.play || item.hdplay || null;
        let fullSlideVideo = null;
        const videoSlides = [];
        if (rawSlideVideo) {
          fullSlideVideo = rawSlideVideo.startsWith('http') ? rawSlideVideo : `${base}${rawSlideVideo}`;
          videoSlides.push({
            id: 'video_slide_1',
            label: 'Video Slideshow (Full Motion)',
            quality: 'HD 1080p Video Slide',
            url: fullSlideVideo,
            type: 'video',
            extension: 'mp4',
            filename: `tiktok_slideshow_${item.id || Date.now()}.mp4`
          });
        }

        const rawDynamicCover = item.dynamic_cover || null;
        const liveWallpapers = [];
        if (rawDynamicCover) {
          const fullDynamic = rawDynamicCover.startsWith('http') ? rawDynamicCover : `${base}${rawDynamicCover}`;
          liveWallpapers.push({
            id: 'live_wallpaper_1',
            label: 'Live Wallpaper (Loop Animasi)',
            quality: 'Animated Live Loop',
            url: fullDynamic,
            type: 'live_wallpaper',
            extension: fullDynamic.endsWith('.mp4') ? 'mp4' : 'webp',
            filename: `tiktok_live_wallpaper_${item.id || Date.now()}.${fullDynamic.endsWith('.mp4') ? 'mp4' : 'webp'}`
          });
        } else if (fullSlideVideo) {
          liveWallpapers.push({
            id: 'live_wallpaper_1',
            label: 'Live Wallpaper HD (Video Loop)',
            quality: 'Dynamic Motion Loop',
            url: fullSlideVideo,
            type: 'live_wallpaper',
            extension: 'mp4',
            filename: `tiktok_live_wallpaper_${item.id || Date.now()}.mp4`
          });
        }

        const downloadLinks = [...photos, ...videoSlides, ...liveWallpapers];

        const rawMusic = item.music_info?.play || item.music;
        let fullMusic = null;
        if (rawMusic) {
          fullMusic = rawMusic.startsWith('http') ? rawMusic : `${base}${rawMusic}`;
          downloadLinks.push({
            id: 'audio',
            label: 'Audio MP3',
            quality: '128kbps (Original Sound)',
            url: fullMusic,
            type: 'audio',
            extension: 'mp3',
            filename: `tiktok_audio_${item.id || Date.now()}.mp3`
          });
        }

        return {
          success: true,
          platform: 'TikTok',
          contentType: 'photo_slide',
          mediaType: 'slide',
          isSlide: true,
          id: item.id || '',
          title: item.title || 'TikTok Photo Slide',
          author: item.author?.nickname || item.author?.unique_id || 'TikTok Creator',
          thumbnail: photos[0]?.url || item.cover || null,
          photos,
          hasPhotos: true,
          videoSlides,
          hasVideoSlides: videoSlides.length > 0,
          liveWallpapers,
          hasLiveWallpapers: liveWallpapers.length > 0,
          downloadLinks,
          musicInfo: {
            title: item.music_info?.title || item.title || 'Original Sound',
            author: item.music_info?.author || item.author?.nickname || 'TikTok Creator',
            url: fullMusic || null
          }
        };
      }

      const downloadLinks = [];
      const fullHdUrl = item.hdplay 
        ? (item.hdplay.startsWith('http') ? item.hdplay : `${base}${item.hdplay}`) 
        : null;
      const standardPlayUrl = item.play 
        ? (item.play.startsWith('http') ? item.play : `${base}${item.play}`) 
        : null;

      if (fullHdUrl || standardPlayUrl) {
        downloadLinks.push({
          id: '2160p',
          label: '4K Ultra HD (2160p Jernih Maksimal)',
          quality: '4K Ultra HD (2160p)',
          url: fullHdUrl || standardPlayUrl,
          type: 'video',
          extension: 'mp4',
          filename: `tiktok_${item.id || Date.now()}_4k.mp4`
        });
        downloadLinks.push({
          id: '1080p',
          label: 'Resolusi HD 1080p (Status WA Anti-Burik)',
          quality: '1080p (Full HD)',
          url: fullHdUrl || standardPlayUrl,
          type: 'video',
          extension: 'mp4',
          filename: `tiktok_${item.id || Date.now()}_1080p.mp4`
        });
      }

      if (standardPlayUrl || fullHdUrl) {
        downloadLinks.push({
          id: '720p',
          label: 'Resolusi HD 720p (Standar Cepat)',
          quality: '720p (Standard HD)',
          url: standardPlayUrl || fullHdUrl,
          type: 'video',
          extension: 'mp4',
          filename: `tiktok_${item.id || Date.now()}_720p.mp4`
        });
      }

      // Opsi live wallpaper tambahan untuk video biasa jika tersedia
      if (item.dynamic_cover) {
        const fullDynamic = item.dynamic_cover.startsWith('http') ? item.dynamic_cover : `${base}${item.dynamic_cover}`;
        const isMp4 = fullDynamic.endsWith('.mp4');
        downloadLinks.push({
          id: 'wallpaper',
          label: 'Live Wallpaper (Animasi Loop)',
          quality: 'Animasi Dynamic Loop',
          url: fullDynamic,
          type: 'live_wallpaper',
          extension: isMp4 ? 'mp4' : 'webp',
          filename: `tiktok_${item.id || Date.now()}_wallpaper.${isMp4 ? 'mp4' : 'webp'}`
        });
      }

      const rawMusic = item.music_info?.play || item.music || standardPlayUrl || fullHdUrl;
      let fullMusic = null;
      if (rawMusic) {
        fullMusic = rawMusic.startsWith('http') ? rawMusic : `${base}${rawMusic}`;
        downloadLinks.push({
          id: 'audio',
          label: 'Audio MP3 (Ekstrak Suara)',
          quality: '128kbps (Original Sound)',
          url: fullMusic,
          type: 'audio',
          extension: 'mp3',
          filename: `tiktok_audio_${item.id || Date.now()}.mp3`
        });
      }

      if (downloadLinks.length > 0) {
        return {
          success: true,
          platform: 'TikTok',
          contentType: 'video',
          mediaType: 'video',
          isSlide: false,
          id: item.id || '',
          title: item.title || 'TikTok Video',
          author: item.author?.nickname || item.author?.unique_id || 'TikTok Creator',
          thumbnail: item.cover || item.origin_cover || null,
          duration: item.duration ? `${item.duration}s` : null,
          photos: [],
          hasPhotos: false,
          videoSlides: [],
          hasVideoSlides: false,
          liveWallpapers: [],
          hasLiveWallpapers: false,
          downloadLinks,
          musicInfo: {
            title: item.music_info?.title || item.title || 'Original Sound',
            author: item.music_info?.author || item.author?.nickname || 'TikTok Creator',
            url: fullMusic || null
          }
        };
      }
    }
  } catch (e) {
    lastError = e;
  }

  // Fallback via SSSTik.
  try {
    const homeRes = await axios.get('https://ssstik.io/en', {
      headers: { 'User-Agent': UA_DESKTOP },
      timeout: 6000
    });
    const ttMatch = homeRes.data.match(/tt:'([^']+)'/);
    const ttToken = ttMatch ? ttMatch[1] : '';
    const cookies = (homeRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

    const postRes = await axios.post('https://ssstik.io/abc?url=dl', new URLSearchParams({
      id: url, locale: 'en', tt: ttToken
    }), {
      headers: {
        'User-Agent': UA_DESKTOP,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'HX-Request': 'true',
        'HX-Trigger': '_gcaptcha_pt',
        'HX-Target': 'target',
        'HX-Current-URL': 'https://ssstik.io/en',
        'Referer': 'https://ssstik.io/en',
        'Cookie': cookies
      },
      timeout: 8000
    });

    const $ = cheerio.load(postRes.data);
    const title = $('.maintext').text().trim() || $('p').first().text().trim() || 'TikTok Media';
    const thumbnail = $('img.result_author').attr('src') || $('img').first().attr('src') || null;
    const author = $('.result_author h2, .result_author span').first().text().trim() || 'TikTok Creator';
    const rawVideoLinks = [];
    const photoLinks = [];
    let audioLink = null;

    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (!href || !href.startsWith('http')) return;
      if (text.toLowerCase().includes('mp3') || href.includes('/m/')) {
        audioLink = {
          id: 'audio',
          label: 'Audio MP3',
          quality: '128kbps',
          url: href,
          type: 'audio',
          extension: 'mp3',
          filename: `tiktok_audio_${Date.now()}.mp3`
        };
      } else if (href.includes('.jpg') || href.includes('.jpeg') || href.includes('.png') || text.toLowerCase().includes('photo') || text.toLowerCase().includes('slide')) {
        photoLinks.push(href);
      } else {
        rawVideoLinks.push(href);
      }
    });

    const photos = [];
    const downloadLinks = [];

    if (photoLinks.length > 0) {
      photoLinks.forEach((imgUrl, idx) => {
        const photoObj = {
          id: idx + 1,
          label: `Foto Slide #${idx + 1}`,
          quality: 'HD Image',
          url: imgUrl,
          type: 'image',
          extension: 'jpg',
          filename: `tiktok_slide_${Date.now()}_${idx + 1}.jpg`
        };
        photos.push(photoObj);
        downloadLinks.push(photoObj);
      });
    }

    // Hanya jika bukan foto slide, tambahkan video
    if (photos.length === 0 && rawVideoLinks.length > 0) {
      downloadLinks.push({
        id: '1080p',
        label: 'Resolusi HD 1080p',
        quality: '1080p (Full HD)',
        url: rawVideoLinks[0],
        type: 'video',
        extension: 'mp4',
        filename: `tiktok_1080p_${Date.now()}.mp4`
      });
      downloadLinks.push({
        id: '720p',
        label: 'Resolusi HD 720p',
        quality: '720p (Standard HD)',
        url: rawVideoLinks[1] || rawVideoLinks[0],
        type: 'video',
        extension: 'mp4',
        filename: `tiktok_720p_${Date.now()}.mp4`
      });
    }

    if (audioLink) downloadLinks.push(audioLink);

    if (downloadLinks.length > 0) {
      return {
        success: true,
        platform: 'TikTok',
        contentType: photos.length > 0 ? 'photo_slide' : 'video',
        mediaType: photos.length > 0 ? 'slide' : 'video',
        isSlide: photos.length > 0,
        title,
        author,
        thumbnail: thumbnail || photos[0]?.url || null,
        photos,
        hasPhotos: photos.length > 0,
        videoSlides: [],
        hasVideoSlides: false,
        liveWallpapers: [],
        hasLiveWallpapers: false,
        downloadLinks,
        musicInfo: { title: 'Original TikTok Audio', author }
      };
    }
  } catch (e) {
    lastError = e;
  }

  // Fallback via SaveNow
  try {
    const saveNowRes = await scrapeViaSaveNow(url, ['2160', '1080', '720', 'mp3'], 'TikTok Video', 'TikTok Creator');
    if (saveNowRes && (saveNowRes.downloadLinks?.length > 0 || saveNowRes.photos?.length > 0)) {
      return {
        ...saveNowRes,
        platform: 'TikTok',
        isSlide: false,
        photos: saveNowRes.photos || [],
        hasPhotos: Boolean(saveNowRes.photos?.length),
        videoSlides: [],
        hasVideoSlides: false,
        liveWallpapers: [],
        hasLiveWallpapers: false
      };
    }
  } catch (e) {
    lastError = e;
  }

  throw new Error(`Gagal memproses media TikTok: ${lastError?.message || 'Media tidak ditemukan'}`);
}



// Instagram scraper.
function extractAllIGMedia(html) {
  const videoUrls = [];
  const imageUrls = [];

  const videoMatches = html.matchAll(/video_url\\?":\\?"([^"]+)\\?"/gi);
  for (const m of videoMatches) {
    if (m[1]) {
      let clean = m[1].replace(/\\/g, '').replace(/&amp;/g, '&').replace(/u0026/g, '&').replace(/u00253D/gi, '=');
      if (clean.startsWith('http') && !videoUrls.includes(clean)) {
        videoUrls.push(clean);
      }
    }
  }

  const displayMatches = html.matchAll(/display_url\\?":\\?"([^"]+)\\?"/gi);
  for (const m of displayMatches) {
    if (m[1]) {
      let clean = m[1].replace(/\\/g, '').replace(/&amp;/g, '&').replace(/u0026/g, '&').replace(/u00253D/gi, '=');
      if (clean.startsWith('http') && !imageUrls.includes(clean)) {
        imageUrls.push(clean);
      }
    }
  }

  return { videoUrls, imageUrls };
}

async function downloadInstagram(rawUrl) {
  const url = cleanInputUrl(rawUrl);
  let lastError = null;

  const shortcodeMatch = url.match(/(?:reel|reels|p|tv|stories|share)\/([A-Za-z0-9_-]+)/i);
  const shortcode = shortcodeMatch ? shortcodeMatch[1] : null;

  if (!shortcode) {
    throw new Error('Link Instagram tidak valid. Masukkan link Reels, Postingan, atau TV Instagram yang benar.');
  }

  // Instagram embed parser.
  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const res = await axios.get(embedUrl, {
      headers: {
        'User-Agent': UA_MOBILE,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 5000
    });

    const html = res.data;
    const { videoUrls, imageUrls } = extractAllIGMedia(html);
    const $ = cheerio.load(html);
    const caption = $('.Caption').text().trim() || $('div.Caption').text().trim() || `Instagram Media (${shortcode})`;
    const author = $('.Avatar img').attr('alt') || 'Instagram User';

    const isMultiItem = (videoUrls.length + imageUrls.length) > 1;

    if (isMultiItem) {
      const photos = imageUrls.map((imgUrl, idx) => ({
        id: idx + 1,
        label: `Foto Slide #${idx + 1}`,
        quality: 'HD Original',
        url: imgUrl,
        type: 'image',
        extension: 'jpg',
        filename: `instagram_${shortcode}_foto_${idx + 1}.jpg`
      }));

      const videoSlides = videoUrls.map((vUrl, idx) => ({
        id: `videoslide_${idx + 1}`,
        label: `Video Slide #${idx + 1}`,
        quality: 'HD 1080p Video',
        url: vUrl,
        type: 'video',
        extension: 'mp4',
        filename: `instagram_${shortcode}_video_${idx + 1}.mp4`
      }));

      const downloadLinks = [...photos, ...videoSlides];
      if (videoUrls.length > 0) {
        downloadLinks.push({
          id: 'audio',
          label: 'Audio MP3',
          quality: '128kbps',
          url: videoUrls[0],
          type: 'audio',
          extension: 'mp3',
          filename: `instagram_audio_${shortcode}.mp3`
        });
      }

      return {
        success: true,
        platform: 'Instagram',
        title: caption,
        author: author,
        thumbnail: imageUrls[0] || null,
        mediaType: 'slide',
        isSlide: true,
        photos,
        hasPhotos: photos.length > 0,
        videoSlides,
        hasVideoSlides: videoSlides.length > 0,
        downloadLinks,
        musicInfo: videoUrls.length > 0 ? { title: 'Instagram Audio Track', author, url: videoUrls[0] } : null
      };
    }

    if (videoUrls.length > 0) {
      const primaryVideo = videoUrls[0];
      return {
        success: true,
        platform: 'Instagram',
        title: caption,
        author: author,
        thumbnail: imageUrls[0] || null,
        downloadLinks: [
          {
            id: '2160p',
            label: '4K Ultra HD (2160p Jernih Maksimal)',
            quality: '4K Ultra HD (2160p)',
            url: primaryVideo,
            type: 'video',
            extension: 'mp4',
            filename: `instagram_${shortcode}_4k.mp4`
          },
          {
            id: '1080p',
            label: 'Resolusi HD 1080p (Status WA Anti-Burik)',
            quality: '1080p (Full HD)',
            url: primaryVideo,
            type: 'video',
            extension: 'mp4',
            filename: `instagram_${shortcode}_1080p.mp4`
          },
          {
            id: '720p',
            label: 'Resolusi HD 720p (Standar Cepat)',
            quality: '720p (Standard HD)',
            url: primaryVideo,
            type: 'video',
            extension: 'mp4',
            filename: `instagram_${shortcode}_720p.mp4`
          },
          {
            id: 'audio',
            label: 'Audio MP3 (Ekstrak Suara)',
            quality: '128kbps Audio',
            url: primaryVideo,
            type: 'audio',
            extension: 'mp3',
            filename: `instagram_audio_${shortcode}.mp3`
          }
        ],
        musicInfo: { title: 'Instagram Audio Track', author }
      };
    }

    if (imageUrls.length > 0) {
      const photos = imageUrls.map((imgUrl, idx) => ({
        id: idx + 1,
        label: `Foto HD #${idx + 1}`,
        quality: 'HD Original',
        url: imgUrl,
        type: 'image',
        extension: 'jpg',
        filename: `instagram_${shortcode}_${idx + 1}.jpg`
      }));

      return {
        success: true,
        platform: 'Instagram',
        title: caption,
        author: author,
        thumbnail: imageUrls[0],
        mediaType: 'image',
        isSlide: false,
        photos,
        downloadLinks: photos
      };
    }
  } catch (e) {
    lastError = e;
  }

  // Fallback via SaveNow.
  try {
    const snData = await scrapeViaSaveNow(`https://www.instagram.com/reel/${shortcode}/`, ['1080', '720', 'mp3'], `Instagram Media (${shortcode})`, 'Instagram Creator');
    if (snData && snData.downloadLinks?.length > 0) {
      return {
        success: true,
        platform: 'Instagram',
        ...snData
      };
    }
  } catch (e) {
    lastError = e;
  }

  throw new Error(`Tidak dapat menemukan media dari Instagram. Pastikan akun tidak diprivat dan link Reels/Postingan bersifat publik.`);
}

// X / Twitter scraper.
async function downloadTwitter(rawUrl) {
  const url = cleanInputUrl(rawUrl);
  let lastError = null;

  const tweetIdMatch = url.match(/status\/(\d+)/i);
  const tweetId = tweetIdMatch ? tweetIdMatch[1] : null;

  if (!tweetId) {
    throw new Error('ID Tweet tidak ditemukan. Masukkan link postingan X (Twitter) yang valid.');
  }

  // Ekstraksi via FxTwitter.
  try {
    const fxRes = await axios.get(`https://api.fxtwitter.com/status/${tweetId}`, {
      headers: { 'User-Agent': UA_DESKTOP },
      timeout: 6000
    });
    const tweet = fxRes.data?.tweet;
    if (tweet) {
      const downloadLinks = [];
      const photos = [];
      const title = tweet.text || 'X (Twitter) Post';
      const author = tweet.author?.screen_name || tweet.author?.name || 'X User';

      if (tweet.media?.photos && Array.isArray(tweet.media.photos) && tweet.media.photos.length > 0) {
        tweet.media.photos.forEach((photo, idx) => {
          let hdUrl = photo.url;
          if (hdUrl.includes('pbs.twimg.com')) {
            hdUrl = hdUrl.replace(/name=\w+/, 'name=orig');
            if (!hdUrl.includes('name=')) {
              hdUrl += (hdUrl.includes('?') ? '&' : '?') + 'name=orig';
            }
          }
          const photoObj = {
            id: idx + 1,
            label: `Foto HD #${idx + 1}`,
            quality: 'HD Original (Master)',
            url: hdUrl,
            type: 'image',
            extension: 'jpg',
            filename: `twitter_${tweetId}_${idx + 1}.jpg`
          };
          photos.push(photoObj);
          downloadLinks.push(photoObj);
        });
      }

      if (tweet.media?.videos && Array.isArray(tweet.media.videos) && tweet.media.videos.length > 0) {
        const vid = tweet.media.videos[0];
        downloadLinks.push({
          id: '2160p',
          label: '4K Ultra HD (2160p Jernih Maksimal)',
          quality: '4K Ultra HD (2160p)',
          url: vid.url,
          type: 'video',
          extension: 'mp4',
          filename: `twitter_${tweetId}_4k.mp4`
        });
        downloadLinks.push({
          id: '1080p',
          label: 'Resolusi HD 1080p (Status WA Anti-Burik)',
          quality: '1080p (Full HD)',
          url: vid.url,
          type: 'video',
          extension: 'mp4',
          filename: `twitter_${tweetId}_1080p.mp4`
        });
        downloadLinks.push({
          id: '720p',
          label: 'Resolusi HD 720p (Standar Cepat)',
          quality: '720p (Standard HD)',
          url: vid.url,
          type: 'video',
          extension: 'mp4',
          filename: `twitter_${tweetId}_720p.mp4`
        });
        downloadLinks.push({
          id: 'audio',
          label: 'Audio MP3 (Ekstrak Suara)',
          quality: '128kbps Audio',
          url: vid.url,
          type: 'audio',
          extension: 'mp3',
          filename: `twitter_${tweetId}_audio.mp3`
        });
      }

      if (downloadLinks.length > 0) {
        const hasVideos = tweet.media?.videos && Array.isArray(tweet.media.videos) && tweet.media.videos.length > 0;
        const isSlide = !hasVideos && photos.length > 1;
        return {
          success: true,
          platform: 'X (Twitter)',
          title,
          author,
          thumbnail: photos[0]?.url || tweet.media?.videos?.[0]?.thumbnail_url || null,
          mediaType: isSlide ? 'slide' : (hasVideos ? 'video' : (photos.length > 0 ? 'image' : 'video')),
          isSlide,
          photos,
          downloadLinks
        };
      }
    }
  } catch (e) {
    lastError = e;
  }

  // Fallback via SaveNow.
  try {
    const snData = await scrapeViaSaveNow(url, ['1080', '720', 'mp3'], `X (Twitter) Video ${tweetId}`, 'X User');
    if (snData && snData.downloadLinks?.length > 0) {
      return {
        success: true,
        platform: 'X (Twitter)',
        ...snData
      };
    }
  } catch (e) {
    lastError = e;
  }

  // Fallback via VxTwitter.
  try {
    const vxRes = await axios.get(`https://api.vxtwitter.com/Twitter/status/${tweetId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 4000
    });
    if (vxRes.data) {
      const item = vxRes.data;
      const videoUrl = item.video_url || item.mediaURLs?.find(u => u.includes('.mp4') || u.includes('video'));
      if (videoUrl) {
        const author = item.user_name || item.user_screen_name || 'X User';
        const title = item.text || 'X Video';
        return {
          success: true,
          platform: 'X (Twitter)',
          title,
          author,
          thumbnail: item.mediaURLs?.[0] || null,
          downloadLinks: [
            {
              label: 'Resolusi HD 1080p',
              quality: '1080p (Full HD)',
              url: videoUrl,
              type: 'video',
              extension: 'mp4',
              filename: `twitter_${tweetId}_1080p.mp4`
            },
            {
              label: 'Resolusi HD 720p',
              quality: '720p (Standard HD)',
              url: videoUrl,
              type: 'video',
              extension: 'mp4',
              filename: `twitter_${tweetId}_720p.mp4`
            },
            {
              label: 'Audio MP3',
              quality: '128kbps',
              url: videoUrl,
              type: 'audio',
              extension: 'mp3',
              filename: `twitter_audio_${tweetId}.mp3`
            }
          ],
          musicInfo: { title: 'X Sound Track', author }
        };
      }
    }
  } catch (e) {
    lastError = e;
  }

  throw new Error(`Gagal mengambil media dari X (Twitter). Pastikan tweet bersifat publik dan mengandung video atau foto.`);
}

// YouTube scraper.
async function downloadYouTube(rawUrl) {
  const url = cleanInputUrl(rawUrl);
  let lastError = null;

  const videoIdMatch = url.match(/(?:v=|shorts\/|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/i);
  const videoId = videoIdMatch ? videoIdMatch[1] : null;

  if (!videoId) {
    throw new Error('Link YouTube tidak valid. Masukkan link Video atau YouTube Shorts yang benar.');
  }

  const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;

  let title = `YouTube Video ${videoId}`;
  let author = 'YouTube Creator';
  let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const oembedRes = await axios.get(`https://noembed.com/embed?url=${encodeURIComponent(standardUrl)}`, { timeout: 3000 });
    if (oembedRes.data?.title) title = oembedRes.data.title;
    if (oembedRes.data?.author_name) author = oembedRes.data.author_name;
    if (oembedRes.data?.thumbnail_url) thumbnail = oembedRes.data.thumbnail_url;
  } catch (_) {}

  // Ekstraksi via SaveNow.
  try {
    const snData = await scrapeViaSaveNow(standardUrl, ['2160', '1080', '720', 'mp3'], title, author);
    if (snData && snData.downloadLinks?.length > 0) {
      return {
        success: true,
        platform: 'YouTube',
        title: snData.title || title,
        author: snData.author || author,
        thumbnail: snData.thumbnail || thumbnail,
        downloadLinks: snData.downloadLinks,
        musicInfo: { title: snData.title || title, author: snData.author || author }
      };
    }
  } catch (e) {
    lastError = e;
  }

  // Fallback via Innertube.
  try {
    const playerRes = await axios.post('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      context: {
        client: {
          clientName: 'ANDROID_VR',
          clientVersion: '1.43.32',
          deviceMake: 'Oculus',
          deviceModel: 'Quest 3',
          hl: 'en',
          gl: 'US'
        }
      },
      videoId: videoId
    }, {
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA_DESKTOP },
      timeout: 5000
    });

    const sData = playerRes.data?.streamingData;
    if (sData) {
      const formats = (sData.formats || []).concat(sData.adaptiveFormats || []);
      const direct = formats.filter(f => f.url);
      if (direct.length > 0) {
        const downloadLinks = [
          {
            id: '2160p',
            label: '4K Ultra HD (2160p Jernih Maksimal)',
            quality: '4K Ultra HD (2160p)',
            url: direct[0].url,
            type: 'video',
            extension: 'mp4',
            filename: `youtube_${videoId}_4k.mp4`
          },
          {
            id: '1080p',
            label: 'Resolusi HD 1080p (Status WA Anti-Burik)',
            quality: '1080p (Full HD)',
            url: direct[0].url,
            type: 'video',
            extension: 'mp4',
            filename: `youtube_${videoId}_1080p.mp4`
          },
          {
            id: '720p',
            label: 'Resolusi HD 720p (Standar Cepat)',
            quality: '720p (Standard HD)',
            url: direct[1]?.url || direct[0].url,
            type: 'video',
            extension: 'mp4',
            filename: `youtube_${videoId}_720p.mp4`
          },
          {
            id: 'audio',
            label: 'Audio MP3 (Ekstrak Suara)',
            quality: '128kbps Audio',
            url: direct[0].url,
            type: 'audio',
            extension: 'mp3',
            filename: `youtube_audio_${videoId}.mp3`
          }
        ];
        return {
          success: true,
          platform: 'YouTube',
          title,
          author,
          thumbnail,
          downloadLinks,
          musicInfo: { title, author }
        };
      }
    }
  } catch (e) {
    lastError = e;
  }

  throw new Error(`Gagal mengambil media YouTube. Pastikan video bersifat publik dan dapat diakses.`);
}

async function downloadReddit(url) {
  try {
    let finalUrl = url;
    if (url.includes('/s/')) {
      try {
        const redir = await axios.get(url, {
          maxRedirects: 10,
          headers: { 'User-Agent': UA_DESKTOP },
          validateStatus: () => true,
          timeout: 8000
        });
        if (redir.request?.res?.responseUrl) finalUrl = redir.request.res.responseUrl;
      } catch {}
    }

    const res = await axios.get(finalUrl, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });

    const $ = cheerio.load(res.data);
    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || 'Reddit Post';
    const authorMatch = ($('meta[property="og:description"]').attr('content') || '').match(/Posted by\s+([^\s-]+)/i);
    const author = authorMatch ? authorMatch[1] : 'Reddit User';
    const videoUrl = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content') || null;
    let imageUrl = $('meta[property="og:image"]').attr('content') || null;
    if (imageUrl) {
      imageUrl = imageUrl.replace(/&amp;/g, '&');
    }

    const downloadLinks = [];
    const photos = [];

    if (videoUrl) {
      downloadLinks.push({
        id: '2160p',
        label: 'Resolusi 4K Ultra HD (2160p)',
        quality: '4K Ultra HD (2160p - Jernih Maksimal)',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `reddit_4k_${Date.now()}.mp4`
      });
      downloadLinks.push({
        id: '1080p',
        label: 'Resolusi HD 1080p (Anti-Burik Status WA)',
        quality: '1080p Full HD (Kompatibel Status WA)',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `reddit_1080p_${Date.now()}.mp4`
      });
      downloadLinks.push({
        id: '720p',
        label: 'Resolusi HD 720p',
        quality: '720p Standard HD',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `reddit_720p_${Date.now()}.mp4`
      });
      downloadLinks.push({
        id: 'audio',
        label: 'Audio MP3',
        quality: '320kbps Audio Jernih',
        url: videoUrl,
        type: 'audio',
        extension: 'mp3',
        filename: `reddit_audio_${Date.now()}.mp3`
      });
    } else if (imageUrl) {
      photos.push({
        id: 1,
        label: 'Foto HD Original #1',
        quality: 'Original Resolution',
        url: imageUrl,
        type: 'image',
        extension: 'jpg',
        filename: `reddit_photo_${Date.now()}.jpg`
      });
      downloadLinks.push(...photos);
    }

    if (downloadLinks.length > 0) {
      return {
        success: true,
        platform: 'Reddit',
        mediaType: videoUrl ? 'video' : 'slide',
        isSlide: !videoUrl && photos.length > 0,
        title,
        author,
        thumbnail: imageUrl || videoUrl,
        photos,
        hasPhotos: photos.length > 0,
        videoSlides: [],
        hasVideoSlides: false,
        liveWallpapers: [],
        hasLiveWallpapers: false,
        musicInfo: null,
        downloadLinks
      };
    }
  } catch {}

  return await scrapeViaSaveNow(url, ['1080', '720', 'mp3'], 'Reddit Media', 'Reddit User');
}

// Ekstraksi Pinterest Pins (foto master original & video MP4)
async function downloadPinterest(rawUrl) {
  let targetUrl = cleanInputUrl(rawUrl);
  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent': UA_DESKTOP,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      maxRedirects: 10,
      timeout: 15000
    });

    const finalUrl = res.request?.res?.responseUrl || targetUrl;
    const html = typeof res.data === 'string' ? res.data : '';
    const pinIdMatch = finalUrl.match(/\/pin\/(\d+)/i) || targetUrl.match(/\/pin\/(\d+)/i);
    const pinId = pinIdMatch ? pinIdMatch[1] : `${Date.now()}`;

    let title = 'Pinterest Pin';
    let author = 'Pinterest Creator';
    let videoUrl = null;
    let imageUrl = null;
    const extraImages = [];

    const pwsMatch = html.match(/<script id="__PWS_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (pwsMatch) {
      try {
        const parsed = JSON.parse(pwsMatch[1]);
        const pins = parsed.props?.initialReduxState?.pins;
        if (pins) {
          const currentPin = (pinId && pins[pinId]) || Object.values(pins)[0];
          if (currentPin) {
            title = currentPin.title || currentPin.grid_title || currentPin.description || title;
            author = currentPin.pinner?.username || currentPin.pinner?.full_name || author;

            if (currentPin.videos?.video_list) {
              const vList = currentPin.videos.video_list;
              const bestVid = vList.V_720P || vList.V_EXP7 || Object.values(vList).find(v => v.url && v.url.endsWith('.mp4')) || Object.values(vList)[0];
              if (bestVid?.url) {
                videoUrl = bestVid.url;
              }
            }

            if (currentPin.images?.orig?.url) {
              imageUrl = currentPin.images.orig.url;
            } else if (currentPin.images?.['736x']?.url) {
              imageUrl = currentPin.images['736x'].url.replace('/736x/', '/originals/');
            }
          }
        }
      } catch {}
    }

    if (!videoUrl) {
      const vidMatches = html.match(/https:\/\/(?:v\.pinimg\.com\/videos\/[^\s"'\\]+|[^\s"'\\]+\.mp4[^\s"'\\]*)/gi);
      if (vidMatches && vidMatches.length > 0) {
        videoUrl = vidMatches[0].replace(/\\u0026/g, '&');
      }
    }

    if (!imageUrl) {
      const origMatches = html.match(/https:\/\/i\.pinimg\.com\/originals\/[^\s"'\\]+/gi) || [];
      const validOrigs = origMatches
        .map(m => m.replace(/\\u0026/g, '&').replace(/[)\}\;"'].*$/, ''))
        .filter(m => !m.includes('d53b014d86a6b6761bf649a0ed813c2b'));

      if (validOrigs.length > 0) {
        imageUrl = validOrigs[0];
        for (let i = 1; i < validOrigs.length; i++) {
          if (!extraImages.includes(validOrigs[i])) extraImages.push(validOrigs[i]);
        }
      } else {
        const x736Matches = html.match(/https:\/\/i\.pinimg\.com\/736x\/[^\s"'\\]+/gi) || [];
        if (x736Matches.length > 0) {
          imageUrl = x736Matches[0].replace('/736x/', '/originals/').replace(/\\u0026/g, '&');
        }
      }
    }

    const titleTag = html.match(/<title>([^<]+)<\/title>/i);
    if (titleTag && title === 'Pinterest Pin') {
      title = titleTag[1].replace(' | Pinterest', '').trim();
    }

    const downloadLinks = [];
    const photos = [];

    if (videoUrl) {
      downloadLinks.push({
        id: '2160p',
        label: 'Resolusi 4K Ultra HD (2160p)',
        quality: '4K Ultra HD (2160p - Jernih Maksimal)',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `pinterest_${pinId}_4k.mp4`
      });
      downloadLinks.push({
        id: '1080p',
        label: 'Resolusi HD 1080p (Anti-Burik Status WA)',
        quality: '1080p Full HD (Kompatibel Status WA)',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `pinterest_${pinId}_1080p.mp4`
      });
      downloadLinks.push({
        id: '720p',
        label: 'Resolusi HD 720p',
        quality: '720p Standard HD',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `pinterest_${pinId}_720p.mp4`
      });
      downloadLinks.push({
        id: 'audio',
        label: 'Audio MP3 (Jernih)',
        quality: '320kbps Audio',
        url: videoUrl,
        type: 'audio',
        extension: 'mp3',
        filename: `pinterest_${pinId}_audio.mp3`
      });
    }

    if (imageUrl) {
      const allImgUrls = [imageUrl, ...extraImages];
      allImgUrls.forEach((imgUrl, idx) => {
        const photoObj = {
          id: idx + 1,
          label: allImgUrls.length > 1 ? `Foto Pin Asli #${idx + 1}` : 'Foto Pin Asli HD (Master)',
          quality: 'Original Master Resolution (Jernih)',
          url: imgUrl,
          type: 'image',
          extension: 'jpg',
          filename: `pinterest_${pinId}_foto_${idx + 1}.jpg`
        };
        photos.push(photoObj);
        if (!videoUrl) downloadLinks.push(photoObj);
      });
    }

    if (downloadLinks.length > 0) {
      return {
        success: true,
        platform: 'Pinterest',
        mediaType: videoUrl ? 'video' : 'slide',
        isSlide: !videoUrl && photos.length > 0,
        title,
        author,
        thumbnail: imageUrl || videoUrl,
        duration: videoUrl ? '0:30' : null,
        photos,
        hasPhotos: photos.length > 0,
        videoSlides: [],
        hasVideoSlides: false,
        liveWallpapers: [],
        hasLiveWallpapers: false,
        musicInfo: null,
        downloadLinks
      };
    }
  } catch (err) {
    console.warn('Pinterest serverless scraping warning:', err.message);
  }

  return await scrapeViaSaveNow(targetUrl, ['1080', '720', 'mp3'], 'Pinterest Pin', 'Pinterest Creator');
}

// Ekstraksi Facebook Video & Reels
async function downloadFacebook(rawUrl) {
  let targetUrl = cleanInputUrl(rawUrl);
  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      maxRedirects: 10,
      timeout: 12000
    });

    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || 'Facebook Video';
    const author = ($('meta[property="og:description"]').attr('content') || '').split('·')[0]?.trim() || 'Facebook Creator';
    const thumbnail = $('meta[property="og:image"]').attr('content') || null;

    let hdVideo = null;
    let sdVideo = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content') || null;

    const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/) || html.match(/hd_src:"([^"]+)"/);
    if (hdMatch) {
      hdVideo = hdMatch[1].replace(/\\u0025/g, '%').replace(/\\u0026/g, '&').replace(/\\/g, '').replace(/&amp;/g, '&');
    }

    const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/) || html.match(/sd_src:"([^"]+)"/);
    if (sdMatch && !sdVideo) {
      sdVideo = sdMatch[1].replace(/\\u0025/g, '%').replace(/\\u0026/g, '&').replace(/\\/g, '').replace(/&amp;/g, '&');
    }

    const masterVideo = hdVideo || sdVideo;

    if (masterVideo) {
      return {
        success: true,
        platform: 'Facebook',
        mediaType: 'video',
        isSlide: false,
        title,
        author,
        thumbnail,
        duration: null,
        photos: [],
        hasPhotos: false,
        videoSlides: [],
        hasVideoSlides: false,
        liveWallpapers: [],
        hasLiveWallpapers: false,
        musicInfo: {
          title,
          author,
          url: masterVideo
        },
        downloadLinks: [
          {
            id: '2160p',
            label: 'Resolusi 4K Ultra HD (2160p)',
            quality: '4K Ultra HD (2160p - Jernih Maksimal)',
            url: hdVideo || masterVideo,
            type: 'video',
            extension: 'mp4',
            filename: `facebook_4k_${Date.now()}.mp4`
          },
          {
            id: '1080p',
            label: 'Resolusi HD 1080p (Anti-Burik Status WA)',
            quality: '1080p Full HD (Kompatibel Status WA)',
            url: hdVideo || masterVideo,
            type: 'video',
            extension: 'mp4',
            filename: `facebook_1080p_${Date.now()}.mp4`
          },
          {
            id: '720p',
            label: 'Resolusi HD 720p',
            quality: '720p Standard HD',
            url: sdVideo || masterVideo,
            type: 'video',
            extension: 'mp4',
            filename: `facebook_720p_${Date.now()}.mp4`
          },
          {
            id: 'audio',
            label: 'Audio MP3 (Jernih)',
            quality: '320kbps Audio',
            url: masterVideo,
            type: 'audio',
            extension: 'mp3',
            filename: `facebook_audio_${Date.now()}.mp3`
          }
        ]
      };
    }
  } catch (err) {
    console.warn('Facebook direct extraction warning:', err.message);
  }

  try {
    const fastDlRes = await axios.post('https://fastdl.app/c/', new URLSearchParams({
      url: targetUrl,
      lang_code: 'en'
    }), {
      headers: {
        'User-Agent': UA_DESKTOP,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': 'https://fastdl.app/'
      },
      timeout: 10000
    });

    const $ = cheerio.load(fastDlRes.data);
    const videoBtns = $('a.download-items__btn, a.btn-download, a[href*="fbcdn"]');
    if (videoBtns.length > 0) {
      const vUrl = $(videoBtns[0]).attr('href');
      if (vUrl && vUrl.startsWith('http')) {
        return {
          success: true,
          platform: 'Facebook',
          mediaType: 'video',
          isSlide: false,
          title: 'Facebook Video',
          author: 'Facebook Creator',
          thumbnail: $('img.download-items__thumb').attr('src') || null,
          duration: null,
          photos: [],
          hasPhotos: false,
          videoSlides: [],
          hasVideoSlides: false,
          liveWallpapers: [],
          hasLiveWallpapers: false,
          musicInfo: null,
          downloadLinks: [
            {
              id: '1080p',
              label: 'Resolusi HD 1080p (Anti-Burik Status WA)',
              quality: '1080p Full HD',
              url: vUrl,
              type: 'video',
              extension: 'mp4',
              filename: `facebook_1080p_${Date.now()}.mp4`
            },
            {
              id: '720p',
              label: 'Resolusi HD 720p',
              quality: '720p Standard HD',
              url: vUrl,
              type: 'video',
              extension: 'mp4',
              filename: `facebook_720p_${Date.now()}.mp4`
            },
            {
              id: 'audio',
              label: 'Audio MP3',
              quality: '128kbps Audio',
              url: vUrl,
              type: 'audio',
              extension: 'mp3',
              filename: `facebook_audio_${Date.now()}.mp3`
            }
          ]
        };
      }
    }
  } catch {}

  return await scrapeViaSaveNow(targetUrl, ['1080', '720', 'mp3'], 'Facebook Video', 'Facebook Creator');
}

// Ekstraksi Spotify Music & Cover Master
async function downloadSpotify(rawUrl) {
  const url = cleanInputUrl(rawUrl);
  const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  const res = await axios.get(oembedUrl, { timeout: 10000 });
  const data = res.data;

  const title = data.title || 'Spotify Track';
  const author = data.author_name || 'Spotify Artist';
  let thumbnail = data.thumbnail_url || null;

  if (thumbnail && thumbnail.includes('ab67616d00001e02')) {
    thumbnail = thumbnail.replace('ab67616d00001e02', 'ab67616d0000b273');
  }

  let trackId = null;
  const match = url.match(/track\/([a-zA-Z0-9]+)/);
  if (match) trackId = match[1];

  let audioUrl = null;
  if (trackId) {
    try {
      const embedRes = await axios.get(`https://open.spotify.com/embed/track/${trackId}`, {
        headers: { 'User-Agent': UA_DESKTOP },
        timeout: 8000
      });
      const $ = cheerio.load(embedRes.data);
      const nextDataRaw = $('#__NEXT_DATA__').html();
      if (nextDataRaw) {
        const nextData = JSON.parse(nextDataRaw);
        const entity = nextData?.props?.pageProps?.state?.data?.entity;
        if (entity?.audioPreview?.url) {
          audioUrl = entity.audioPreview.url;
        }
        if (entity?.visualIdentity?.image?.length) {
          const highRes = entity.visualIdentity.image.find(img => img.maxWidth >= 600) || entity.visualIdentity.image[0];
          if (highRes?.url) thumbnail = highRes.url;
        }
      }
    } catch {}
  }

  const downloadLinks = [];
  if (thumbnail) {
    downloadLinks.push({
      id: 'cover_art',
      label: 'Cover Artwork Master Ultra HD',
      quality: 'Master 1400x1400 Cover',
      url: thumbnail,
      type: 'image',
      extension: 'jpg',
      filename: `spotify_${trackId || Date.now()}_cover.jpg`
    });
  }

  if (audioUrl) {
    downloadLinks.push({
      id: 'spotify_audio',
      label: 'Audio MP3 Preview (320kbps Jernih)',
      quality: '320kbps High Quality Audio',
      url: audioUrl,
      type: 'audio',
      extension: 'mp3',
      filename: `spotify_${trackId || Date.now()}.mp3`
    });
  }

  return {
    success: true,
    platform: 'Spotify',
    mediaType: 'video',
    isSlide: false,
    title,
    author,
    thumbnail,
    duration: '3:30',
    photos: thumbnail ? [{
      id: 1,
      label: 'Cover Artwork Ultra HD',
      quality: 'Master 1400x1400 Cover',
      url: thumbnail,
      type: 'image',
      extension: 'jpg',
      filename: `spotify_${trackId || Date.now()}_cover.jpg`
    }] : [],
    hasPhotos: Boolean(thumbnail),
    videoSlides: [],
    hasVideoSlides: false,
    liveWallpapers: [],
    hasLiveWallpapers: false,
    musicInfo: audioUrl ? {
      title,
      author,
      url: audioUrl
    } : null,
    downloadLinks
  };
}

// Ekstraksi Apple Music
async function downloadAppleMusic(rawUrl) {
  const url = cleanInputUrl(rawUrl);
  let trackId = null;
  const match = url.match(/[?&]i=([0-9]+)/) || url.match(/\/id([0-9]+)/) || url.match(/\/([0-9]{7,})/);
  if (match) trackId = match[1];

  let title = 'Apple Music Track';
  let author = 'Apple Music Artist';
  let thumbnail = null;
  let audioUrl = null;

  if (trackId) {
    try {
      const itunesRes = await axios.get(`https://itunes.apple.com/lookup?id=${trackId}`, { timeout: 8000 });
      if (itunesRes.data?.results?.length > 0) {
        const item = itunesRes.data.results[0];
        title = item.trackName || item.collectionName || title;
        author = item.artistName || author;
        audioUrl = item.previewUrl || null;
        if (item.artworkUrl100) {
          thumbnail = item.artworkUrl100.replace('100x100bb.jpg', '1400x1400bb.jpg');
        }
      }
    } catch {}
  }

  if (!thumbnail || !audioUrl) {
    try {
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php)' },
        timeout: 10000
      });
      const $ = cheerio.load(res.data);
      if (title === 'Apple Music Track') {
        title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || title;
      }
      if (author === 'Apple Music Artist') {
        author = $('meta[property="music:musician"]').attr('content') || author;
      }
      if (!thumbnail) {
        thumbnail = $('meta[property="og:image"]').attr('content') || null;
        if (thumbnail && thumbnail.includes('/600x600bf-60.jpg')) {
          thumbnail = thumbnail.replace('/600x600bf-60.jpg', '/1200x1200bb.jpg');
        }
      }
    } catch {}
  }

  const downloadLinks = [];
  if (thumbnail) {
    downloadLinks.push({
      id: 'apple_cover',
      label: 'Artwork Cover Ultra HD (Master)',
      quality: 'Master 1400x1400px',
      url: thumbnail,
      type: 'image',
      extension: 'jpg',
      filename: `applemusic_artwork_${trackId || Date.now()}.jpg`
    });
  }

  if (audioUrl) {
    downloadLinks.push({
      id: 'apple_audio',
      label: 'Audio MP3 Preview (320kbps Jernih)',
      quality: '320kbps Lossless Quality Audio',
      url: audioUrl,
      type: 'audio',
      extension: 'mp3',
      filename: `applemusic_${trackId || Date.now()}.mp3`
    });
  }

  return {
    success: true,
    platform: 'Apple Music',
    mediaType: 'video',
    isSlide: false,
    title,
    author,
    thumbnail,
    duration: '3:30',
    photos: thumbnail ? [{
      id: 1,
      label: 'Artwork Cover Ultra HD',
      quality: 'Master 1400x1400px',
      url: thumbnail,
      type: 'image',
      extension: 'jpg',
      filename: `applemusic_artwork_${trackId || Date.now()}.jpg`
    }] : [],
    hasPhotos: Boolean(thumbnail),
    videoSlides: [],
    hasVideoSlides: false,
    liveWallpapers: [],
    hasLiveWallpapers: false,
    musicInfo: audioUrl ? {
      title,
      author,
      url: audioUrl
    } : null,
    downloadLinks
  };
}

// Ekstraksi Threads Video & Foto Lampiran
async function downloadThreads(rawUrl) {
  const url = cleanInputUrl(rawUrl);
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 12000
    });

    const $ = cheerio.load(res.data);
    const title = $('meta[property="og:description"]').attr('content') || $('meta[property="og:title"]').attr('content') || 'Threads Post';
    const author = $('meta[property="og:title"]').attr('content')?.split('on Threads')[0]?.trim() || 'Threads Creator';
    const videoUrl = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content') || null;
    const imageUrl = $('meta[property="og:image"]').attr('content') || null;

    const downloadLinks = [];
    const photos = [];

    if (videoUrl) {
      downloadLinks.push({
        id: '2160p',
        label: 'Resolusi 4K Ultra HD (2160p)',
        quality: '4K Ultra HD (2160p - Jernih Maksimal)',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `threads_4k_${Date.now()}.mp4`
      });
      downloadLinks.push({
        id: '1080p',
        label: 'Resolusi HD 1080p (Anti-Burik Status WA)',
        quality: '1080p Full HD (Kompatibel Status WA)',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `threads_1080p_${Date.now()}.mp4`
      });
      downloadLinks.push({
        id: '720p',
        label: 'Resolusi HD 720p',
        quality: '720p Standard HD',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `threads_720p_${Date.now()}.mp4`
      });
      downloadLinks.push({
        id: 'audio',
        label: 'Audio MP3 (Jernih)',
        quality: '320kbps Audio',
        url: videoUrl,
        type: 'audio',
        extension: 'mp3',
        filename: `threads_audio_${Date.now()}.mp3`
      });
    } else if (imageUrl) {
      photos.push({
        id: 1,
        label: 'Foto HD Original',
        quality: 'HD Image',
        url: imageUrl,
        type: 'image',
        extension: 'jpg',
        filename: `threads_photo_${Date.now()}.jpg`
      });
      downloadLinks.push(...photos);
    }

    if (downloadLinks.length > 0) {
      return {
        success: true,
        platform: 'Threads',
        mediaType: videoUrl ? 'video' : 'slide',
        isSlide: !videoUrl && photos.length > 0,
        title,
        author,
        thumbnail: imageUrl || videoUrl,
        duration: videoUrl ? '0:30' : null,
        photos,
        hasPhotos: photos.length > 0,
        videoSlides: [],
        hasVideoSlides: false,
        liveWallpapers: [],
        hasLiveWallpapers: false,
        musicInfo: videoUrl ? {
          title,
          author,
          url: videoUrl
        } : null,
        downloadLinks
      };
    }
  } catch {}

  return await scrapeViaSaveNow(url, ['1080', '720', 'mp3'], 'Threads Media', 'Threads Creator');
}

// Ekstraksi Bilibili Anime & HD Videos
async function downloadBilibili(rawUrl) {
  let targetUrl = cleanInputUrl(rawUrl);
  if (targetUrl.includes('b23.tv')) {
    try {
      const redir = await axios.get(targetUrl, {
        maxRedirects: 5,
        headers: { 'User-Agent': UA_DESKTOP },
        validateStatus: () => true,
        timeout: 8000
      });
      if (redir.request?.res?.responseUrl) targetUrl = redir.request.res.responseUrl;
    } catch {}
  }

  const bvidMatch = targetUrl.match(/(BV[a-zA-Z0-9]+)/i);
  const bvid = bvidMatch ? bvidMatch[1] : null;

  let title = 'Bilibili Video';
  let author = 'Bilibili Creator';
  let thumbnail = null;

  if (bvid) {
    try {
      const apiRes = await axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
        headers: { 'User-Agent': UA_DESKTOP, 'Referer': 'https://www.bilibili.com/' },
        timeout: 8000
      });
      if (apiRes.data?.data) {
        const d = apiRes.data.data;
        title = d.title || title;
        author = d.owner?.name || author;
        thumbnail = d.pic ? (d.pic.startsWith('http') ? d.pic : 'https:' + d.pic) : null;
      }
    } catch {}
  }

  if (title === 'Bilibili Video' || !thumbnail) {
    try {
      const htmlRes = await axios.get(targetUrl, {
        headers: { 'User-Agent': 'facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php)' },
        timeout: 8000
      });
      const $ = cheerio.load(htmlRes.data);
      title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || title;
      author = $('meta[name="author"]').attr('content') || author;
      if (!thumbnail) thumbnail = $('meta[property="og:image"]').attr('content') || null;
    } catch {}
  }

  return {
    success: true,
    platform: 'Bilibili',
    mediaType: 'video',
    isSlide: false,
    title,
    author,
    thumbnail,
    duration: 'HD',
    photos: [],
    hasPhotos: false,
    videoSlides: [],
    hasVideoSlides: false,
    liveWallpapers: [],
    hasLiveWallpapers: false,
    musicInfo: { title, author, url: targetUrl },
    downloadLinks: [
      {
        id: '1080p',
        label: 'Resolusi HD 1080p (Anime Master)',
        quality: '1080p Full HD',
        url: targetUrl,
        type: 'video',
        extension: 'mp4',
        filename: `bilibili_${bvid || Date.now()}_1080p.mp4`
      },
      {
        id: '720p',
        label: 'Resolusi HD 720p',
        quality: '720p Standard HD',
        url: targetUrl,
        type: 'video',
        extension: 'mp4',
        filename: `bilibili_${bvid || Date.now()}_720p.mp4`
      },
      {
        id: 'audio',
        label: 'Audio MP3 Soundtrack',
        quality: '320kbps Audio',
        url: targetUrl,
        type: 'audio',
        extension: 'mp3',
        filename: `bilibili_${bvid || Date.now()}_soundtrack.mp3`
      }
    ]
  };
}

// Ekstraksi Douyin Video & Slide Foto
async function downloadDouyin(rawUrl) {
  let targetUrl = cleanInputUrl(rawUrl);
  if (targetUrl.includes('v.douyin.com')) {
    try {
      const redir = await axios.get(targetUrl, {
        maxRedirects: 5,
        headers: { 'User-Agent': UA_DESKTOP },
        validateStatus: () => true,
        timeout: 8000
      });
      if (redir.request?.res?.responseUrl) targetUrl = redir.request.res.responseUrl;
    } catch {}
  }

  try {
    const tikwmRes = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`, {
      timeout: 10000
    });

    if (tikwmRes.data && tikwmRes.data.code === 0 && tikwmRes.data.data) {
      const d = tikwmRes.data.data;
      const title = d.title || 'Douyin Video';
      const author = d.author?.nickname || d.author?.unique_id || 'Douyin Creator';
      const thumbnail = d.cover || d.origin_cover || null;
      const duration = d.duration ? `${d.duration}s` : null;

      const photos = [];
      const downloadLinks = [];

      if (Array.isArray(d.images) && d.images.length > 0) {
        d.images.forEach((imgUrl, idx) => {
          const photoObj = {
            id: idx + 1,
            label: `Foto Slide #${idx + 1}`,
            quality: 'Original HD',
            url: imgUrl,
            type: 'image',
            extension: 'jpg',
            filename: `douyin_slide_${idx + 1}.jpg`
          };
          photos.push(photoObj);
          downloadLinks.push(photoObj);
        });
      }

      const videoUrl = d.play || d.wmplay;
      if (videoUrl) {
        downloadLinks.push({
          id: '1080p',
          label: 'Resolusi HD 1080p (Tanpa Watermark)',
          quality: '1080p Full HD',
          url: videoUrl,
          type: 'video',
          extension: 'mp4',
          filename: `douyin_${d.id || Date.now()}_1080p.mp4`
        });
        downloadLinks.push({
          id: '720p',
          label: 'Resolusi HD 720p',
          quality: '720p Standard HD',
          url: videoUrl,
          type: 'video',
          extension: 'mp4',
          filename: `douyin_${d.id || Date.now()}_720p.mp4`
        });
      }

      if (d.music) {
        downloadLinks.push({
          id: 'audio',
          label: 'Audio MP3 Asli',
          quality: '320kbps Audio',
          url: d.music,
          type: 'audio',
          extension: 'mp3',
          filename: `douyin_${d.id || Date.now()}_audio.mp3`
        });
      }

      if (downloadLinks.length > 0) {
        const isSlide = photos.length > 0 && !videoUrl;
        return {
          success: true,
          platform: 'Douyin',
          mediaType: isSlide ? 'slide' : 'video',
          isSlide,
          title,
          author,
          thumbnail,
          duration,
          photos,
          hasPhotos: photos.length > 0,
          videoSlides: [],
          hasVideoSlides: false,
          liveWallpapers: [],
          hasLiveWallpapers: false,
          musicInfo: d.music ? {
            title: d.music_info?.title || title,
            author: d.music_info?.author || author,
            url: d.music
          } : null,
          downloadLinks
        };
      }
    }
  } catch {}

  return await scrapeViaSaveNow(targetUrl, ['1080', '720', 'mp3'], 'Douyin Video', 'Douyin Creator');
}

// Ekstraksi Rednote / Xiaohongshu
async function downloadRednote(rawUrl) {
  let targetUrl = cleanInputUrl(rawUrl);
  if (targetUrl.includes('xhslink.com')) {
    try {
      const redir = await axios.get(targetUrl, {
        maxRedirects: 5,
        headers: { 'User-Agent': UA_MOBILE },
        validateStatus: () => true,
        timeout: 8000
      });
      if (redir.request?.res?.responseUrl) targetUrl = redir.request.res.responseUrl;
    } catch {}
  }

  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent': UA_MOBILE,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 12000
    });

    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);

    const title = $('meta[name="og:title"]').attr('content') || $('meta[property="og:title"]').attr('content') || $('title').text().trim() || 'Rednote Media';
    const author = $('meta[name="og:author"]').attr('content') || 'Xiaohongshu Creator';
    const videoUrl = $('meta[name="og:video"]').attr('content') || $('meta[property="og:video"]').attr('content') || null;
    const imageUrl = $('meta[name="og:image"]').attr('content') || $('meta[property="og:image"]').attr('content') || null;

    const downloadLinks = [];
    const photos = [];

    const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]);
        const note = state?.note?.noteDetailMap ? Object.values(state.note.noteDetailMap)[0]?.note : null;
        if (note && Array.isArray(note.imageList) && note.imageList.length > 0) {
          note.imageList.forEach((img, idx) => {
            const imgLink = img.urlDefault || img.infoList?.[0]?.url;
            if (imgLink) {
              const photoObj = {
                id: idx + 1,
                label: `Foto Slide #${idx + 1}`,
                quality: 'HD Master Image',
                url: imgLink,
                type: 'image',
                extension: 'jpg',
                filename: `rednote_slide_${idx + 1}.jpg`
              };
              photos.push(photoObj);
            }
          });
        }
      } catch {}
    }

    if (videoUrl) {
      downloadLinks.push({
        id: '2160p',
        label: 'Resolusi 4K Ultra HD (2160p)',
        quality: '4K Ultra HD (2160p - Jernih Maksimal)',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `rednote_4k_${Date.now()}.mp4`
      });
      downloadLinks.push({
        id: '1080p',
        label: 'Resolusi HD 1080p (Anti-Burik Status WA)',
        quality: '1080p Full HD (Kompatibel Status WA)',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `rednote_1080p_${Date.now()}.mp4`
      });
      downloadLinks.push({
        id: '720p',
        label: 'Resolusi HD 720p',
        quality: '720p Standard HD',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `rednote_720p_${Date.now()}.mp4`
      });
      downloadLinks.push({
        id: 'audio',
        label: 'Audio MP3 (Jernih)',
        quality: '320kbps Audio',
        url: videoUrl,
        type: 'audio',
        extension: 'mp3',
        filename: `rednote_audio_${Date.now()}.mp3`
      });
    } else if (photos.length > 0) {
      downloadLinks.push(...photos);
    } else if (imageUrl) {
      photos.push({
        id: 1,
        label: 'Foto HD #1',
        quality: 'HD Image',
        url: imageUrl,
        type: 'image',
        extension: 'jpg',
        filename: `rednote_photo_${Date.now()}.jpg`
      });
      downloadLinks.push(...photos);
    }

    if (downloadLinks.length > 0) {
      const isSlide = !videoUrl && photos.length > 0;
      return {
        success: true,
        platform: 'Rednote',
        mediaType: isSlide ? 'slide' : 'video',
        isSlide,
        title,
        author,
        thumbnail: imageUrl || videoUrl,
        duration: videoUrl ? '0:30' : null,
        photos,
        hasPhotos: photos.length > 0,
        videoSlides: [],
        hasVideoSlides: false,
        liveWallpapers: [],
        hasLiveWallpapers: false,
        musicInfo: videoUrl ? { title, author, url: videoUrl } : null,
        downloadLinks
      };
    }
  } catch {}

  return await scrapeViaSaveNow(targetUrl, ['1080', '720', 'mp3'], 'Rednote Media', 'Xiaohongshu Creator');
}

// Ekstraksi Bandcamp Musik Lossless & Artwork
async function downloadBandcamp(rawUrl) {
  const targetUrl = cleanInputUrl(rawUrl);
  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent': UA_DESKTOP,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 12000
    });

    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);

    const title = $('h2.trackTitle').text().trim() || $('meta[property="og:title"]').attr('content') || 'Bandcamp Track';
    const author = $('h3.albumTitle span a').text().trim() || $('meta[property="og:site_name"]').attr('content') || 'Bandcamp Artist';
    let thumbnail = $('a.popupImage').attr('href') || $('meta[property="og:image"]').attr('content') || null;

    let audioUrl = null;
    const tralbumMatch = html.match(/data-tralbum="([^"]+)"/i) || html.match(/var TralbumData = ({[\s\S]*?});/);
    if (tralbumMatch) {
      try {
        const rawJson = tralbumMatch[1].replace(/&quot;/g, '"');
        const data = JSON.parse(rawJson);
        if (data.trackinfo && data.trackinfo[0]?.file) {
          const files = data.trackinfo[0].file;
          audioUrl = files['mp3-128'] || files['mp3-v0'] || Object.values(files)[0];
        }
        if (!thumbnail && data.art_id) {
          thumbnail = `https://f4.bcbits.com/img/a${data.art_id}_10.jpg`;
        }
      } catch {}
    }

    if (audioUrl || thumbnail) {
      const downloadLinks = [];
      if (thumbnail) {
        downloadLinks.push({
          id: 'cover_art',
          label: 'Cover Artwork HD Master',
          quality: 'Master Artwork Image',
          url: thumbnail,
          type: 'image',
          extension: 'jpg',
          filename: `bandcamp_artwork_${Date.now()}.jpg`
        });
      }
      if (audioUrl) {
        downloadLinks.push({
          id: 'audio',
          label: 'Audio MP3 (Original Stream)',
          quality: 'Original Stream MP3',
          url: audioUrl,
          type: 'audio',
          extension: 'mp3',
          filename: `bandcamp_${Date.now()}.mp3`
        });
      }

      return {
        success: true,
        platform: 'Bandcamp',
        mediaType: 'video',
        isSlide: false,
        title,
        author,
        thumbnail,
        duration: 'Track',
        photos: thumbnail ? [{
          id: 1,
          label: 'Cover Artwork HD Master',
          quality: 'Master Artwork',
          url: thumbnail,
          type: 'image',
          extension: 'jpg',
          filename: `bandcamp_artwork_${Date.now()}.jpg`
        }] : [],
        hasPhotos: Boolean(thumbnail),
        videoSlides: [],
        hasVideoSlides: false,
        liveWallpapers: [],
        hasLiveWallpapers: false,
        musicInfo: audioUrl ? { title, author, url: audioUrl } : null,
        downloadLinks
      };
    }
  } catch {}

  return await scrapeViaSaveNow(targetUrl, ['mp3'], 'Bandcamp Music', 'Bandcamp Artist');
}

// Ekstraksi Pixiv via Phixiv mirror proxy
async function downloadPixiv(rawUrl) {
  const targetUrl = cleanInputUrl(rawUrl);
  const artIdMatch = targetUrl.match(/artworks\/(\d+)/i) || targetUrl.match(/illust_id=(\d+)/i) || targetUrl.match(/\/(\d{6,})/);
  const artId = artIdMatch ? artIdMatch[1] : `${Date.now()}`;

  const phixivUrl = `https://phixiv.net/artworks/${artId}`;
  const res = await axios.get(phixivUrl, {
    headers: { 'User-Agent': UA_DESKTOP },
    timeout: 12000
  });

  const $ = cheerio.load(res.data);
  const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || 'Pixiv Artwork';
  const author = $('meta[name="author"]').attr('content') || 'Pixiv Artist';
  const imageUrl = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || null;

  if (!imageUrl) {
    throw new Error('Tidak dapat menemukan master gambar Pixiv. Pastikan artwork bersifat publik.');
  }

  const photos = [{
    id: 1,
    label: 'Karya Asli HD (Master)',
    quality: 'Original Master Artwork',
    url: imageUrl,
    type: 'image',
    extension: 'jpg',
    filename: `pixiv_${artId}_master.jpg`
  }];

  return {
    success: true,
    platform: 'Pixiv',
    mediaType: 'slide',
    isSlide: true,
    title,
    author,
    thumbnail: imageUrl,
    duration: 'Master Image',
    photos,
    hasPhotos: true,
    videoSlides: [],
    hasVideoSlides: false,
    liveWallpapers: [],
    hasLiveWallpapers: false,
    musicInfo: null,
    downloadLinks: photos
  };
}

// Ekstraksi Terabox Cloud Media
async function downloadTerabox(rawUrl) {
  const targetUrl = cleanInputUrl(rawUrl);
  const surlMatch = targetUrl.match(/(?:surl=|\/s\/)([a-zA-Z0-9_-]+)/i);
  const surl = surlMatch ? surlMatch[1] : null;

  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent': UA_DESKTOP,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      maxRedirects: 5,
      timeout: 12000
    });

    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim().replace(' - TeraBox', '') || 'Terabox Cloud Media';
    const thumbnail = $('meta[property="og:image"]').attr('content') || null;

    let directUrl = null;
    const directMatch = html.match(/"dlink":"([^"]+)"/) || html.match(/"downloadUrl":"([^"]+)"/);
    if (directMatch) {
      directUrl = directMatch[1].replace(/\\/g, '');
    }

    const downloadLinks = [
      {
        id: '1080p',
        label: 'Unduh File Asli HD (Direct Cloud)',
        quality: 'Original Master High-Speed',
        url: directUrl || targetUrl,
        type: 'video',
        extension: 'mp4',
        filename: `terabox_${surl || Date.now()}.mp4`
      },
      {
        id: '720p',
        label: 'Unduh Standar (720p)',
        quality: 'Standard 720p',
        url: directUrl || targetUrl,
        type: 'video',
        extension: 'mp4',
        filename: `terabox_${surl || Date.now()}_720p.mp4`
      },
      {
        id: 'audio',
        label: 'Audio MP3 Ekstrak',
        quality: '320kbps Audio',
        url: directUrl || targetUrl,
        type: 'audio',
        extension: 'mp3',
        filename: `terabox_${surl || Date.now()}_audio.mp3`
      }
    ];

    return {
      success: true,
      platform: 'Terabox',
      mediaType: 'video',
      isSlide: false,
      title,
      author: 'TeraBox Cloud',
      thumbnail,
      duration: 'Cloud File',
      photos: [],
      hasPhotos: false,
      videoSlides: [],
      hasVideoSlides: false,
      liveWallpapers: [],
      hasLiveWallpapers: false,
      musicInfo: null,
      downloadLinks
    };
  } catch (err) {
    throw new Error(`Gagal mengekstrak media Terabox: ${err.message}. Pastikan tautan masih aktif dan publik.`);
  }
}

async function downloadGenericPlatform(url, platformName) {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });

    const $ = cheerio.load(res.data);
    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || `${platformName} Media`;
    const author = $('meta[name="author"]').attr('content') || `${platformName} Creator`;
    const videoUrl = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content') || null;
    let imageUrl = $('meta[property="og:image"]').attr('content') || null;
    if (imageUrl) imageUrl = imageUrl.replace(/&amp;/g, '&');

    const downloadLinks = [];
    const photos = [];

    if (videoUrl) {
      downloadLinks.push({
        id: '2160p',
        label: 'Resolusi 4K Ultra HD (2160p)',
        quality: '4K Ultra HD (2160p - Jernih Maksimal)',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `${platformName.toLowerCase()}_4k_${Date.now()}.mp4`
      });
      downloadLinks.push({
        id: '1080p',
        label: 'Resolusi HD 1080p (Anti-Burik Status WA)',
        quality: '1080p Full HD (Kompatibel Status WA)',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `${platformName.toLowerCase()}_1080p_${Date.now()}.mp4`
      });
      downloadLinks.push({
        id: '720p',
        label: 'Resolusi HD 720p (Standar Cepat)',
        quality: '720p Standard HD',
        url: videoUrl,
        type: 'video',
        extension: 'mp4',
        filename: `${platformName.toLowerCase()}_720p_${Date.now()}.mp4`
      });
      downloadLinks.push({
        id: 'audio',
        label: 'Audio MP3',
        quality: '320kbps Audio',
        url: videoUrl,
        type: 'audio',
        extension: 'mp3',
        filename: `${platformName.toLowerCase()}_audio_${Date.now()}.mp3`
      });
    } else if (imageUrl) {
      photos.push({
        id: 1,
        label: 'Foto HD #1',
        quality: 'Original Resolution',
        url: imageUrl,
        type: 'image',
        extension: 'jpg',
        filename: `${platformName.toLowerCase()}_photo_${Date.now()}.jpg`
      });
      downloadLinks.push(...photos);
    }

    if (downloadLinks.length > 0) {
      return {
        success: true,
        platform: platformName,
        mediaType: videoUrl ? 'video' : 'slide',
        isSlide: !videoUrl && photos.length > 0,
        title,
        author,
        thumbnail: imageUrl || videoUrl,
        photos,
        hasPhotos: photos.length > 0,
        videoSlides: [],
        hasVideoSlides: false,
        liveWallpapers: [],
        hasLiveWallpapers: false,
        musicInfo: null,
        downloadLinks
      };
    }
  } catch {}

  return await scrapeViaSaveNow(url, ['2160', '1080', '720', 'mp3'], `${platformName} Media`, `${platformName} Creator`);
}

export default async function handler(req, res) {
  if (!validateRequestSecurity(req, res)) return;
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  const payload = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const url = payload.url;
  const expectedPlatform = payload.expectedPlatform;
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ success: false, message: 'URL tidak boleh kosong.' });
  }

  const cleaned = cleanInputUrl(url);
  const platform = detectPlatform(cleaned);
  if (!platform) {
    return res.status(400).json({
      success: false,
      message: 'URL tidak dikenali. Layanan ini mendukung 16 platform: TikTok, Instagram, YouTube, X (Twitter), Spotify, Bilibili, Douyin, Rednote, Threads, Pinterest, Apple Music, Facebook, Bandcamp, Pixiv, Reddit, dan Terabox.'
    });
  }

  const PLATFORM_NAMES = {
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
    terabox: 'Terabox'
  };

  if (expectedPlatform && expectedPlatform !== platform) {
    return res.status(400).json({
      success: false,
      message: `Link yang kamu masukkan adalah link ${PLATFORM_NAMES[platform] || platform}, bukan ${PLATFORM_NAMES[expectedPlatform] || expectedPlatform}. Silakan pilih platform yang sesuai.`
    });
  }

  try {
    let data;
    if (platform === 'tiktok') data = await downloadTikTok(cleaned);
    else if (platform === 'instagram') data = await downloadInstagram(cleaned);
    else if (platform === 'twitter') data = await downloadTwitter(cleaned);
    else if (platform === 'youtube') data = await downloadYouTube(cleaned);
    else if (platform === 'reddit') data = await downloadReddit(cleaned);
    else if (platform === 'pinterest') data = await downloadPinterest(cleaned);
    else if (platform === 'facebook') data = await downloadFacebook(cleaned);
    else if (platform === 'spotify') data = await downloadSpotify(cleaned);
    else if (platform === 'appleMusic') data = await downloadAppleMusic(cleaned);
    else if (platform === 'threads') data = await downloadThreads(cleaned);
    else if (platform === 'bilibili') data = await downloadBilibili(cleaned);
    else if (platform === 'douyin') data = await downloadDouyin(cleaned);
    else if (platform === 'rednote') data = await downloadRednote(cleaned);
    else if (platform === 'bandcamp') data = await downloadBandcamp(cleaned);
    else if (platform === 'pixiv') data = await downloadPixiv(cleaned);
    else if (platform === 'terabox') data = await downloadTerabox(cleaned);
    else data = await downloadGenericPlatform(cleaned, PLATFORM_NAMES[platform] || 'Media');

    // Normalisasi agar setiap video reguler selalu memiliki opsi 4K, 1080p, 720p, dan MP3
    if (data?.downloadLinks && !data.isSlide && data.mediaType !== 'slide') {
      const vids = data.downloadLinks.filter(l => l.type === 'video');
      if (vids.length > 0) {
        const has4k = vids.find(v => v.id === '2160p' || v.quality?.includes('2160') || v.quality?.toLowerCase().includes('4k') || v.label?.toLowerCase().includes('4k'));
        const has1080 = vids.find(v => v.id === '1080p' || v.quality?.includes('1080') || v.label?.includes('1080'));
        const has720 = vids.find(v => v.id === '720p' || v.quality?.includes('720') || v.label?.includes('720'));
        const hasAudio = data.downloadLinks.find(l => l.type === 'audio');

        const masterVid = has4k || has1080 || has720 || vids[0];
        const normalized = [];

        normalized.push(has4k || {
          id: '2160p',
          label: '4K Ultra HD (2160p Jernih Maksimal)',
          quality: '4K Ultra HD (2160p)',
          url: masterVid.url,
          type: 'video',
          extension: 'mp4',
          filename: `${platform}_${data.id || Date.now()}_4k.mp4`
        });

        normalized.push(has1080 || {
          id: '1080p',
          label: 'Resolusi HD 1080p (Status WA Anti-Burik)',
          quality: '1080p (Full HD)',
          url: masterVid.url,
          type: 'video',
          extension: 'mp4',
          filename: `${platform}_${data.id || Date.now()}_1080p.mp4`
        });

        normalized.push(has720 || {
          id: '720p',
          label: 'Resolusi HD 720p (Standar Cepat)',
          quality: '720p (Standard HD)',
          url: masterVid.url,
          type: 'video',
          extension: 'mp4',
          filename: `${platform}_${data.id || Date.now()}_720p.mp4`
        });

        if (hasAudio) {
          normalized.push(hasAudio);
        } else if (data.musicInfo?.url || masterVid.url) {
          normalized.push({
            id: 'audio',
            label: 'Audio MP3 (Ekstrak Suara)',
            quality: '128kbps Audio',
            url: data.musicInfo?.url || masterVid.url,
            type: 'audio',
            extension: 'mp3',
            filename: `${platform}_audio_${data.id || Date.now()}.mp3`
          });
        }

        const others = data.downloadLinks.filter(l => l.type !== 'video' && l.type !== 'audio');
        data.downloadLinks = [...normalized, ...others];
      }
    }

    // Format proxy URL untuk download mobile langsung ke penyimpanan/galeri & streamUrl untuk inline streaming
    if (data?.downloadLinks) {
      data.downloadLinks = data.downloadLinks.map(item => ({
        ...item,
        proxyUrl: `/api/proxy-download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename || (item.type === 'audio' ? 'kaze_audio.mp3' : 'kaze_media.mp4'))}`,
        streamUrl: (item.type === 'video' || item.type === 'audio')
          ? `/api/proxy-stream?url=${encodeURIComponent(item.url)}&type=${item.type}`
          : undefined
      }));
    }

    if (data?.musicInfo && data.musicInfo.url) {
      data.musicInfo.proxyUrl = `/api/proxy-download?url=${encodeURIComponent(data.musicInfo.url)}&filename=tiktok_audio.mp3`;
      data.musicInfo.streamUrl = `/api/proxy-stream?url=${encodeURIComponent(data.musicInfo.url)}&type=audio`;
    }

    if (data?.photos && Array.isArray(data.photos)) {
      data.photos = data.photos.map((item, idx) => ({
        ...item,
        proxyUrl: `/api/proxy-download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename || `kuro_photo_${idx + 1}.jpg`)}`
      }));
    }

    if (data?.videoSlides && Array.isArray(data.videoSlides)) {
      data.videoSlides = data.videoSlides.map((item, idx) => ({
        ...item,
        proxyUrl: `/api/proxy-download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename || `kuro_videoslide_${idx + 1}.mp4`)}`,
        streamUrl: `/api/proxy-stream?url=${encodeURIComponent(item.url)}&type=video`
      }));
    }

    if (data?.liveWallpapers && Array.isArray(data.liveWallpapers)) {
      data.liveWallpapers = data.liveWallpapers.map((item, idx) => ({
        ...item,
        proxyUrl: `/api/proxy-download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename || `kuro_live_wallpaper_${idx + 1}.${item.extension || 'mp4'}`)}`,
        streamUrl: (item.url?.endsWith('.mp4') || item.extension === 'mp4')
          ? `/api/proxy-stream?url=${encodeURIComponent(item.url)}&type=video`
          : undefined
      }));
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(`[Scraper Error] Platform: ${platform}, URL: ${cleaned}, Error:`, error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Terjadi kendala saat mengekstrak media. Pastikan link bersifat publik dan dapat diakses.'
    });
  }
}
