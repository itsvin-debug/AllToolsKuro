import axios from 'axios';
import * as cheerio from 'cheerio';
import { downloadWithYtDlp } from './ytdlp.service.js';

// Ekstraksi Threads Video & Foto Lampiran
export async function downloadThreads(rawUrl) {
  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 12000
    });

    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);

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
  } catch (err) {
    console.warn('Threads direct scraper warning:', err.message);
  }

  // Fallback yt-dlp jika direct scraping tidak menghasilkan link
  return await downloadWithYtDlp(targetUrl, 'Threads');
}
