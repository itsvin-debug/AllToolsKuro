import axios from 'axios';
import * as cheerio from 'cheerio';
import { downloadWithYtDlp } from './ytdlp.service.js';

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function cleanEscapedUrl(urlStr) {
  if (!urlStr) return null;
  return urlStr
    .replace(/\\u0025/g, '%')
    .replace(/\\u0026/g, '&')
    .replace(/\\/g, '')
    .replace(/&amp;/g, '&');
}

// Ekstraksi Facebook Video & Reels publik
export async function downloadFacebook(rawUrl) {
  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  // 1. Scraping langsung via OpenGraph & internal payload Facebook
  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      maxRedirects: 10,
      timeout: 12000
    });

    const finalUrl = res.request?.res?.responseUrl || targetUrl;
    const html = typeof res.data === 'string' ? res.data : '';
    const $ = cheerio.load(html);

    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || 'Facebook Video';
    const author = ($('meta[property="og:description"]').attr('content') || '').split('·')[0]?.trim() || 'Facebook Creator';
    const thumbnail = $('meta[property="og:image"]').attr('content') || null;

    let hdVideo = null;
    let sdVideo = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content') || null;

    // Cari url HD di dalam payload script FB
    const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/) || html.match(/hd_src:"([^"]+)"/);
    if (hdMatch) {
      hdVideo = cleanEscapedUrl(hdMatch[1]);
    }

    const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/) || html.match(/sd_src:"([^"]+)"/);
    if (sdMatch && !sdVideo) {
      sdVideo = cleanEscapedUrl(sdMatch[1]);
    }

    const masterVideo = hdVideo || sdVideo;

    if (masterVideo) {
      const downloadLinks = [
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
      ];

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
        downloadLinks
      };
    }
  } catch (err) {
    console.warn('Facebook direct extraction warning:', err.message);
  }

  // 2. Fallback FastDL scraper untuk Facebook
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
      timeout: 12000
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
  } catch (fastDlErr) {
    console.warn('Facebook FastDL fallback warning:', fastDlErr.message);
  }

  // 3. Fallback yt-dlp untuk server backend lokal
  return await downloadWithYtDlp(targetUrl, 'Facebook');
}
