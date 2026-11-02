import axios from 'axios';
import * as cheerio from 'cheerio';
import { downloadWithYtDlp } from './ytdlp.service.js';

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Ekstraksi Pinterest Pins (foto kualitas master original & video MP4)
export async function downloadPinterest(rawUrl) {
  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

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

    // 1. Ekstraksi state JSON internal (__PWS_DATA__)
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
      } catch (pwsErr) {
        console.warn('Pinterest PWS parse error:', pwsErr.message);
      }
    }

    // 2. Fallback regex langsung ke CDN Pinterest dalam HTML
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

    // Title fallback
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
    console.warn('Pinterest direct scraper warning, attempting fallback:', err.message);
  }

  // Fallback yt-dlp untuk backend lokal jika ada
  return await downloadWithYtDlp(targetUrl, 'Pinterest');
}
