import express from 'express';
import axios from 'axios';
import { scrapeTiktok } from '../scrapers/tiktokScraper.js';
import { scrapeInstagram } from '../scrapers/instagramScraper.js';
import { scrapeTwitter } from '../scrapers/twitterScraper.js';
import { scrapeGithub } from '../scrapers/githubScraper.js';

const router = express.Router();

// Universal Image Proxy Anti-CORS & Anti-Hotlink
export const handleImageProxy = async (req, res) => {
  const targetUrl = req.query?.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).send('Parameter url gambar wajib disertakan.');
  }

  let referer = 'https://www.google.com/';
  if (targetUrl.includes('tiktok') || targetUrl.includes('byteoversea') || targetUrl.includes('ibytedtos')) {
    referer = 'https://www.tiktok.com/';
  } else if (targetUrl.includes('cdninstagram') || targetUrl.includes('fbcdn')) {
    referer = 'https://www.instagram.com/';
  } else if (targetUrl.includes('twimg') || targetUrl.includes('x.com') || targetUrl.includes('twitter')) {
    referer = 'https://x.com/';
  } else if (targetUrl.includes('githubusercontent')) {
    referer = 'https://github.com/';
  }

  try {
    const streamRes = await axios.get(targetUrl, {
      responseType: 'stream',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': referer,
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });

    res.setHeader('Content-Type', streamRes.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    streamRes.data.pipe(res);
  } catch (err) {
    res.status(502).send('Gagal mengambil gambar dari CDN sumber.');
  }
};

router.get('/image-proxy', handleImageProxy);

// 1. TikTok Stalker
const handleTiktok = async (req, res) => {
  const target = req.body?.username || req.body?.url || req.query?.username || req.query?.url || '';
  const forceRefresh = req.query?.refresh === 'true' || req.body?.refresh === true;
  const result = await scrapeTiktok(target, { forceRefresh });
  res.status(result.statusCode || (result.success ? 200 : 400)).json(result);
};
router.get('/tiktok', handleTiktok);
router.post('/tiktok', handleTiktok);

// 2. Instagram Stalker
const handleInstagram = async (req, res) => {
  const target = req.body?.username || req.body?.url || req.query?.username || req.query?.url || '';
  const forceRefresh = req.query?.refresh === 'true' || req.body?.refresh === true;
  const result = await scrapeInstagram(target, { forceRefresh });
  res.status(result.statusCode || (result.success ? 200 : 400)).json(result);
};
router.get('/instagram', handleInstagram);
router.post('/instagram', handleInstagram);

// 3. Twitter / X Stalker
const handleTwitter = async (req, res) => {
  const target = req.body?.username || req.body?.url || req.query?.username || req.query?.url || '';
  const forceRefresh = req.query?.refresh === 'true' || req.body?.refresh === true;
  const result = await scrapeTwitter(target, { forceRefresh });
  res.status(result.statusCode || (result.success ? 200 : 400)).json(result);
};
router.get('/twitter', handleTwitter);
router.post('/twitter', handleTwitter);

// 4. GitHub Stalker
const handleGithub = async (req, res) => {
  const target = req.body?.username || req.body?.url || req.query?.username || req.query?.url || '';
  const forceRefresh = req.query?.refresh === 'true' || req.body?.refresh === true;
  const result = await scrapeGithub(target, { forceRefresh });
  res.status(result.statusCode || (result.success ? 200 : 400)).json(result);
};
router.get('/github', handleGithub);
router.post('/github', handleGithub);

export default router;
