import axios from 'axios';
import * as cheerio from 'cheerio';

// Ekstraksi Pixiv via Phixiv mirror proxy (resolusi master artwork)
export async function downloadPixiv(rawUrl) {
  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    const artIdMatch = targetUrl.match(/artworks\/(\d+)/i) || targetUrl.match(/illust_id=(\d+)/i) || targetUrl.match(/\/(\d{6,})/);
    const artId = artIdMatch ? artIdMatch[1] : `${Date.now()}`;

    // Gunakan gateway phixiv yang mengekspos metadata dan gambar asli tanpa login
    const phixivUrl = `https://phixiv.net/artworks/${artId}`;
    const res = await axios.get(phixivUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
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
  } catch (err) {
    throw new Error(`Gagal mengekstrak Pixiv: ${err.message}`);
  }
}
