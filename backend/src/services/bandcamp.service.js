import axios from 'axios';
import * as cheerio from 'cheerio';
import { downloadWithYtDlp } from './ytdlp.service.js';

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Ekstraksi Bandcamp Musik Lossless & Artwork
export async function downloadBandcamp(rawUrl) {
  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

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
        musicInfo: audioUrl ? {
          title,
          author,
          url: audioUrl
        } : null,
        downloadLinks
      };
    }
  } catch (err) {
    console.warn('Bandcamp direct extraction warning, using yt-dlp:', err.message);
  }

  // Fallback yt-dlp (yt-dlp memiliki extractor Bandcamp bawaan yang sangat stabil)
  return await downloadWithYtDlp(targetUrl, 'Bandcamp');
}
