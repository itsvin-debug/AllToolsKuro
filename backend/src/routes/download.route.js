import express from 'express';
import axios from 'axios';
import { detectPlatform, PLATFORM_NAMES } from '../services/detector.service.js';
import { downloadTikTok } from '../services/tiktok.service.js';
import { downloadInstagram } from '../services/instagram.service.js';
import { downloadTwitter } from '../services/twitter.service.js';
import { downloadYouTube } from '../services/youtube.service.js';
import { downloadWithYtDlp } from '../services/ytdlp.service.js';
import { downloadSpotify } from '../services/spotify.service.js';
import { downloadAppleMusic } from '../services/applemusic.service.js';
import { downloadThreads } from '../services/threads.service.js';
import { downloadReddit } from '../services/reddit.service.js';
import { downloadPixiv } from '../services/pixiv.service.js';
import { downloadRednote } from '../services/rednote.service.js';
import { downloadTerabox } from '../services/terabox.service.js';
import { downloadFacebook } from '../services/facebook.service.js';
import { downloadPinterest } from '../services/pinterest.service.js';
import { downloadBilibili } from '../services/bilibili.service.js';
import { downloadDouyin } from '../services/douyin.service.js';
import { downloadBandcamp } from '../services/bandcamp.service.js';

const router = express.Router();

// Endpoint Utama: POST /api/download
router.post('/download', async (req, res) => {
  try {
    const { url, expectedPlatform } = req.body;

    // validasi apakah url dikirim
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Mohon masukkan URL video yang ingin diunduh.'
      });
    }

    // deteksi platform asal link
    const detection = detectPlatform(url);

    if (!detection.valid || detection.platform === 'unknown') {
      return res.status(400).json({
        success: false,
        message: 'URL tidak dikenali. Layanan ini mendukung 16 platform: TikTok, Instagram, YouTube, X (Twitter), Spotify, Bilibili, Douyin, Rednote, Threads, Pinterest, Apple Music, Facebook, Bandcamp, Pixiv, Reddit, dan Terabox.'
      });
    }

    // validasi kecocokan platform jika user berada di menu spesifik
    if (expectedPlatform && expectedPlatform !== detection.platform) {
      const currentMenu = PLATFORM_NAMES[expectedPlatform] || expectedPlatform;
      const detectedMenu = PLATFORM_NAMES[detection.platform] || detection.platform;
      return res.status(400).json({
        success: false,
        message: `Link yang kamu masukkan berasal dari ${detectedMenu}, bukan ${currentMenu}. Silakan masukkan link ${currentMenu} yang valid atau beralih ke tab menu ${detectedMenu}.`
      });
    }

    let mediaData = null;

    // routing ke service masing-masing platform
    switch (detection.platform) {
      case 'tiktok':
        mediaData = await downloadTikTok(detection.cleanedUrl);
        break;

      case 'instagram':
        mediaData = await downloadInstagram(detection.cleanedUrl);
        break;

      case 'twitter':
        mediaData = await downloadTwitter(detection.cleanedUrl);
        break;

      case 'youtube':
        mediaData = await downloadYouTube(detection.cleanedUrl);
        break;

      case 'facebook':
        mediaData = await downloadFacebook(detection.cleanedUrl);
        break;

      case 'reddit':
        mediaData = await downloadReddit(detection.cleanedUrl);
        break;

      case 'pinterest':
        mediaData = await downloadPinterest(detection.cleanedUrl);
        break;

      case 'bilibili':
        mediaData = await downloadBilibili(detection.cleanedUrl);
        break;

      case 'douyin':
        mediaData = await downloadDouyin(detection.cleanedUrl);
        break;

      case 'bandcamp':
        mediaData = await downloadBandcamp(detection.cleanedUrl);
        break;

      case 'threads':
        mediaData = await downloadThreads(detection.cleanedUrl);
        break;

      case 'spotify':
        mediaData = await downloadSpotify(detection.cleanedUrl);
        break;

      case 'appleMusic':
        mediaData = await downloadAppleMusic(detection.cleanedUrl);
        break;

      case 'pixiv':
        mediaData = await downloadPixiv(detection.cleanedUrl);
        break;

      case 'rednote':
        mediaData = await downloadRednote(detection.cleanedUrl);
        break;

      case 'terabox':
        mediaData = await downloadTerabox(detection.cleanedUrl);
        break;

      default:
        mediaData = await downloadWithYtDlp(detection.cleanedUrl, 'Media');
        break;
    }

    // Normalisasi agar setiap video reguler selalu memiliki opsi 4K, 1080p, 720p, dan MP3
    if (mediaData?.downloadLinks && !mediaData.isSlide && mediaData.mediaType !== 'slide') {
      const vids = mediaData.downloadLinks.filter(l => l.type === 'video');
      if (vids.length > 0) {
        const has4k = vids.find(v => v.id === '2160p' || v.quality?.includes('2160') || v.quality?.toLowerCase().includes('4k') || v.label?.toLowerCase().includes('4k'));
        const has1080 = vids.find(v => v.id === '1080p' || v.quality?.includes('1080') || v.label?.includes('1080'));
        const has720 = vids.find(v => v.id === '720p' || v.quality?.includes('720') || v.label?.includes('720'));
        const hasAudio = mediaData.downloadLinks.find(l => l.type === 'audio');

        const masterVid = has4k || has1080 || has720 || vids[0];
        const normalized = [];

        normalized.push(has4k || {
          id: '2160p',
          label: '4K Ultra HD (2160p Jernih Maksimal)',
          quality: '4K Ultra HD (2160p)',
          url: masterVid.url,
          type: 'video',
          extension: 'mp4',
          filename: `${detection.platform}_${mediaData.id || Date.now()}_4k.mp4`
        });

        normalized.push(has1080 || {
          id: '1080p',
          label: 'Resolusi HD 1080p (Status WA Anti-Burik)',
          quality: '1080p (Full HD)',
          url: masterVid.url,
          type: 'video',
          extension: 'mp4',
          filename: `${detection.platform}_${mediaData.id || Date.now()}_1080p.mp4`
        });

        normalized.push(has720 || {
          id: '720p',
          label: 'Resolusi HD 720p (Standar Cepat)',
          quality: '720p (Standard HD)',
          url: masterVid.url,
          type: 'video',
          extension: 'mp4',
          filename: `${detection.platform}_${mediaData.id || Date.now()}_720p.mp4`
        });

        if (hasAudio) {
          normalized.push(hasAudio);
        } else if (mediaData.musicInfo?.url || masterVid.url) {
          normalized.push({
            id: 'audio',
            label: 'Audio MP3 (Ekstrak Suara)',
            quality: '128kbps Audio',
            url: mediaData.musicInfo?.url || masterVid.url,
            type: 'audio',
            extension: 'mp3',
            filename: `${detection.platform}_audio_${mediaData.id || Date.now()}.mp3`
          });
        }

        const others = mediaData.downloadLinks.filter(l => l.type !== 'video' && l.type !== 'audio');
        mediaData.downloadLinks = [...normalized, ...others];
      }
    }

    // tambahkan proxyUrl & streamUrl ke setiap link agar download otomatis aman dari blokir CORS
    if (mediaData && mediaData.downloadLinks) {
      mediaData.downloadLinks = mediaData.downloadLinks.map((item) => ({
        ...item,
        proxyUrl: `/api/proxy-download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename || (item.type === 'audio' ? 'kaze_audio.mp3' : 'kaze_download.mp4'))}`,
        streamUrl: (item.type === 'video' || item.type === 'audio')
          ? `/api/proxy-stream?url=${encodeURIComponent(item.url)}&type=${item.type}`
          : undefined
      }));
    }

    if (mediaData && mediaData.musicInfo && mediaData.musicInfo.url) {
      mediaData.musicInfo.proxyUrl = `/api/proxy-download?url=${encodeURIComponent(mediaData.musicInfo.url)}&filename=tiktok_audio.mp3`;
      mediaData.musicInfo.streamUrl = `/api/proxy-stream?url=${encodeURIComponent(mediaData.musicInfo.url)}&type=audio`;
    }

    // tambahkan proxyUrl & streamUrl ke setiap video slide di mediaData.videoSlides
    if (mediaData && mediaData.videoSlides && Array.isArray(mediaData.videoSlides)) {
      mediaData.videoSlides = mediaData.videoSlides.map((item, idx) => ({
        ...item,
        proxyUrl: `/api/proxy-download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename || `kaze_videoslide_${idx + 1}.mp4`)}`,
        streamUrl: `/api/proxy-stream?url=${encodeURIComponent(item.url)}&type=video`
      }));
    }

    // tambahkan juga proxyUrl ke setiap foto di mediaData.photos
    if (mediaData && mediaData.photos && Array.isArray(mediaData.photos)) {
      mediaData.photos = mediaData.photos.map((item, idx) => ({
        ...item,
        proxyUrl: `/api/proxy-download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename || `kaze_photo_${idx + 1}.jpg`)}`
      }));
    }

    // tambahkan proxyUrl & streamUrl ke setiap live wallpaper di mediaData.liveWallpapers
    if (mediaData && mediaData.liveWallpapers && Array.isArray(mediaData.liveWallpapers)) {
      mediaData.liveWallpapers = mediaData.liveWallpapers.map((item, idx) => ({
        ...item,
        proxyUrl: `/api/proxy-download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(item.filename || `kaze_live_wallpaper_${idx + 1}.${item.extension || 'mp4'}`)}`,
        streamUrl: (item.url?.endsWith('.mp4') || item.extension === 'mp4')
          ? `/api/proxy-stream?url=${encodeURIComponent(item.url)}&type=video`
          : undefined
      }));
    }

    return res.status(200).json({
      success: true,
      message: 'Berhasil mengekstrak media.',
      data: mediaData
    });

  } catch (error) {
    console.error('Error pada endpoint /api/download:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Terjadi kesalahan pada server saat memproses link video.'
    });
  }
});

function getRefererForUrl(rawUrl) {
  if (!rawUrl) return undefined;
  const url = rawUrl.toLowerCase();
  if (url.includes('tikwm.com')) return 'https://www.tikwm.com/';
  if (url.includes('tiktok') || url.includes('tikcdn') || url.includes('bytegecko') || url.includes('ibytedtos')) return 'https://www.tiktok.com/';
  if (url.includes('instagram') || url.includes('cdninstagram') || url.includes('fbcdn')) return 'https://www.instagram.com/';
  if (url.includes('twimg') || url.includes('twitter') || url.includes('x.com')) return 'https://twitter.com/';
  if (url.includes('googlevideo') || url.includes('youtube') || url.includes('ytimg')) return 'https://www.youtube.com/';
  if (url.includes('bilibili') || url.includes('bilivideo') || url.includes('hdslb')) return 'https://www.bilibili.com/';
  if (url.includes('douyin') || url.includes('iesdouyin') || url.includes('zijieapi')) return 'https://www.douyin.com/';
  if (url.includes('pixiv') || url.includes('phixiv') || url.includes('pximg')) return 'https://www.pixiv.net/';
  if (url.includes('reddit') || url.includes('redd.it')) return 'https://www.reddit.com/';
  if (url.includes('facebook') || url.includes('fb.watch')) return 'https://www.facebook.com/';
  if (url.includes('spotify') || url.includes('scdn.co')) return 'https://open.spotify.com/';
  if (url.includes('apple.com') || url.includes('mzstatic') || url.includes('itunes')) return 'https://music.apple.com/';
  if (url.includes('pinterest') || url.includes('pinimg')) return 'https://www.pinterest.com/';
  if (url.includes('bandcamp') || url.includes('bcbits')) return 'https://bandcamp.com/';
  if (url.includes('xiaohongshu') || url.includes('xhscdn') || url.includes('rednote')) return 'https://www.xiaohongshu.com/';
  if (url.includes('threads.net')) return 'https://www.threads.net/';
  if (url.includes('terabox')) return 'https://www.terabox.com/';
  return undefined;
}

// Endpoint Streaming Video & Audio: GET /api/proxy-stream
// Mengalirkan video & audio secara inline dengan dukungan Range Header (206 Partial Content) untuk pemutaran lancar tanpa buffer
router.get('/proxy-stream', async (req, res) => {
  try {
    const { url, type } = req.query;
    if (!url) return res.status(400).send('URL target tidak boleh kosong.');

    const targetUrl = decodeURIComponent(url);
    const range = req.headers.range;
    const referer = getRefererForUrl(targetUrl);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    };
    if (referer) headers['Referer'] = referer;
    if (range) headers['Range'] = range;

    const response = await axios({
      method: 'GET',
      url: targetUrl,
      responseType: 'stream',
      headers,
      timeout: 30000,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const isAudio = type === 'audio' || targetUrl.includes('.mp3') || targetUrl.includes('/music/');
    let contentType = response.headers['content-type'];
    if (!contentType || contentType === 'application/octet-stream') {
      contentType = isAudio ? 'audio/mpeg' : 'video/mp4';
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');

    if (response.headers['content-range']) {
      res.setHeader('Content-Range', response.headers['content-range']);
    }
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    res.status(response.status);
    response.data.pipe(res);
  } catch (error) {
    console.error('Error proxy stream media:', error.message);
    if (!res.headersSent) {
      return res.redirect(decodeURIComponent(req.query.url));
    }
  }
});

// Endpoint Proxy Download: GET /api/proxy-download
// Mengalirkan file video/foto langsung ke browser agar otomatis terdownload ke disk/galeri
router.get('/proxy-download', async (req, res) => {
  try {
    const { url, filename } = req.query;

    if (!url) {
      return res.status(400).send('URL target tidak boleh kosong.');
    }

    const safeFilename = (filename || 'download_media.mp4').replace(/[^a-zA-Z0-9_.-]/g, '_');
    let targetUrl = decodeURIComponent(url);
    const referer = getRefererForUrl(targetUrl);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    };
    if (referer) headers['Referer'] = referer;

    // ambil stream file dari server sumber CDN
    const response = await axios({
      method: 'GET',
      url: targetUrl,
      responseType: 'stream',
      headers,
      timeout: 30000
    });

    // set header buat trigger download file di browser
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    // pipe stream langsung ke response client
    response.data.pipe(res);

  } catch (error) {
    console.error('Error pada proxy download:', error.message);
    if (!res.headersSent) {
      return res.status(502).json({
        success: false,
        message: 'Gagal mengunduh berkas dari CDN server sumber.'
      });
    }
  }
});

export default router;
