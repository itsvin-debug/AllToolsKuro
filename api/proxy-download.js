import axios from 'axios';
import { validateRequestSecurity } from './_security.js';

export default async function handler(req, res) {
  if (!validateRequestSecurity(req, res)) return;
  // CORS headers yang valid (tanpa credentials saat origin wildcard *)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url, filename } = req.query;
  if (!url) return res.status(400).json({ error: 'URL target tidak boleh kosong.' });

  const safeFilename = (filename || 'download_media.mp4').replace(/[^a-zA-Z0-9_.\-]/g, '_');

  try {
    let targetUrl = decodeURIComponent(url);

    // Jika targetUrl adalah progress_url (SaveNow encoder), tunggu polling selesai
    if (targetUrl.includes('savenow.to/api/progress') || targetUrl.includes('/api/progress?id=')) {
      for (let i = 0; i < 15; i++) {
        try {
          const progRes = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': 'https://y2down.cc/' },
            timeout: 4000
          });
          if (progRes.data?.download_url) {
            targetUrl = progRes.data.download_url;
            break;
          }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 800));
      }
    }

    // Tentukan referer yang sesuai agar CDN sumber tidak memblokir unduhan
    let referer = undefined;
    const lowerUrl = targetUrl.toLowerCase();
    if (lowerUrl.includes('tikwm.com')) {
      referer = 'https://www.tikwm.com/';
    } else if (lowerUrl.includes('tiktok') || lowerUrl.includes('tikcdn') || lowerUrl.includes('bytegecko') || lowerUrl.includes('ibytedtos')) {
      referer = 'https://www.tiktok.com/';
    } else if (lowerUrl.includes('instagram') || lowerUrl.includes('cdninstagram') || lowerUrl.includes('fbcdn')) {
      referer = 'https://www.instagram.com/';
    } else if (lowerUrl.includes('twimg') || lowerUrl.includes('twitter') || lowerUrl.includes('x.com')) {
      referer = 'https://twitter.com/';
    } else if (lowerUrl.includes('googlevideo') || lowerUrl.includes('youtube') || lowerUrl.includes('ytimg')) {
      referer = 'https://www.youtube.com/';
    } else if (lowerUrl.includes('bilibili') || lowerUrl.includes('bilivideo') || lowerUrl.includes('hdslb')) {
      referer = 'https://www.bilibili.com/';
    } else if (lowerUrl.includes('douyin') || lowerUrl.includes('iesdouyin') || lowerUrl.includes('zijieapi')) {
      referer = 'https://www.douyin.com/';
    } else if (lowerUrl.includes('pixiv') || lowerUrl.includes('phixiv') || lowerUrl.includes('pximg')) {
      referer = 'https://www.pixiv.net/';
    } else if (lowerUrl.includes('reddit') || lowerUrl.includes('redd.it')) {
      referer = 'https://www.reddit.com/';
    } else if (lowerUrl.includes('facebook') || lowerUrl.includes('fb.watch')) {
      referer = 'https://www.facebook.com/';
    } else if (lowerUrl.includes('spotify') || lowerUrl.includes('scdn.co')) {
      referer = 'https://open.spotify.com/';
    } else if (lowerUrl.includes('apple.com') || lowerUrl.includes('mzstatic')) {
      referer = 'https://music.apple.com/';
    } else if (lowerUrl.includes('pinterest') || lowerUrl.includes('pinimg')) {
      referer = 'https://www.pinterest.com/';
    } else if (lowerUrl.includes('bandcamp') || lowerUrl.includes('bcbits')) {
      referer = 'https://bandcamp.com/';
    } else if (lowerUrl.includes('xiaohongshu') || lowerUrl.includes('xhscdn') || lowerUrl.includes('rednote')) {
      referer = 'https://www.xiaohongshu.com/';
    } else if (lowerUrl.includes('threads.net')) {
      referer = 'https://www.threads.net/';
    } else if (lowerUrl.includes('terabox')) {
      referer = 'https://www.terabox.com/';
    } else if (lowerUrl.includes('savenow.to')) {
      referer = 'https://y2down.cc/';
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };
    if (referer) headers['Referer'] = referer;

    const response = await axios({
      method: 'GET',
      url: targetUrl,
      responseType: 'stream',
      headers,
      timeout: 35000,
      validateStatus: (status) => status >= 200 && status < 400
    });

    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    response.data.pipe(res);
  } catch (error) {
    console.error('Proxy download error:', error.message);
    if (!res.headersSent) {
      // Mengembalikan response error JSON yang aman, jangan redirect ke halaman blank!
      return res.status(502).json({
        success: false,
        message: 'Gagal mengunduh berkas dari CDN server sumber.'
      });
    }
  }
}
