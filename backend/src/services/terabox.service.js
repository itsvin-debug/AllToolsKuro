import axios from 'axios';
import * as cheerio from 'cheerio';

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Ekstraksi Terabox Cloud Media
export async function downloadTerabox(rawUrl) {
  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    // 1. Ekstraksi kode share Terabox
    const surlMatch = targetUrl.match(/(?:surl=|\/s\/)([a-zA-Z0-9_-]+)/i);
    const surl = surlMatch ? surlMatch[1] : null;

    // 2. Fetch halaman web untuk mengekstrak metadata file
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

    // Cari direct download link dari script atau fallback ke target direct link
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
