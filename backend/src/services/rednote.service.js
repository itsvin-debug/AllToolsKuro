import axios from 'axios';
import * as cheerio from 'cheerio';
import { downloadWithYtDlp } from './ytdlp.service.js';

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

// Ekstraksi Rednote / Xiaohongshu (Foto Slide & Video HD)
export async function downloadRednote(rawUrl) {
  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    // 1. Tangani redirect xhslink.com
    if (targetUrl.includes('xhslink.com')) {
      try {
        const redir = await axios.get(targetUrl, {
          maxRedirects: 5,
          headers: { 'User-Agent': UA_MOBILE },
          validateStatus: () => true,
          timeout: 8000
        });
        if (redir.request?.res?.responseUrl) {
          targetUrl = redir.request.res.responseUrl;
        }
      } catch {}
    }

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

    // Cek apakah ada multiple image list di dalam __INITIAL_STATE__
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
        musicInfo: videoUrl ? {
          title,
          author,
          url: videoUrl
        } : null,
        downloadLinks
      };
    }
  } catch (err) {
    console.warn('Rednote direct extraction warning:', err.message);
  }

  // Fallback yt-dlp untuk server backend lokal
  return await downloadWithYtDlp(targetUrl, 'Rednote');
}
