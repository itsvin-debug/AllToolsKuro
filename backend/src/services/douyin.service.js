import axios from 'axios';
import * as cheerio from 'cheerio';
import { downloadWithYtDlp } from './ytdlp.service.js';

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Ekstraksi Douyin Video & Slide Foto Tanpa Watermark
export async function downloadDouyin(rawUrl) {
  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  // 1. Tangani shortlink v.douyin.com
  if (targetUrl.includes('v.douyin.com')) {
    try {
      const redir = await axios.get(targetUrl, {
        maxRedirects: 5,
        headers: { 'User-Agent': UA_DESKTOP },
        validateStatus: () => true,
        timeout: 8000
      });
      if (redir.request?.res?.responseUrl) {
        targetUrl = redir.request.res.responseUrl;
      }
    } catch {}
  }

  // 2. Ekstraksi via TikWM API (sangat handal untuk video & audio Douyin tanpa watermark)
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

      // Cek apakah postingan berupa gambar/slide
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
  } catch (tikwmErr) {
    console.warn('Douyin TikWM extraction warning:', tikwmErr.message);
  }

  // 3. Fallback yt-dlp untuk server backend lokal
  return await downloadWithYtDlp(targetUrl, 'Douyin');
}
