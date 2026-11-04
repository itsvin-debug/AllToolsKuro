import axios from 'axios';
import { validateRequestSecurity } from './_security.js';

export default async function handler(req, res) {
  if (!validateRequestSecurity(req, res)) return;
  // CORS headers yang valid
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url, type } = req.query;
  if (!url) return res.status(400).send('URL target tidak boleh kosong.');

  const targetUrl = decodeURIComponent(url);
  const range = req.headers.range;

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
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  };
  if (referer) headers['Referer'] = referer;
  if (range) headers['Range'] = range;

  try {
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
    console.error('Proxy stream error:', error.message);
    if (!res.headersSent) {
      return res.status(502).send('Gagal memutar stream media.');
    }
  }
}
