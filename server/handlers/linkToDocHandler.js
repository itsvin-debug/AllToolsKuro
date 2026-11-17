import axios from 'axios';
import * as cheerio from 'cheerio';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
};

const SOCIAL_BOT_HEADERS = {
  'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

/**
 * Filter baris teks boilerplate antarmuka Canva & web viewer
 */
function isCanvaBoilerplate(text) {
  const t = text.trim().toLowerCase();
  if (!t || t === '-' || t === '*' || /^[\*\-]\s*\d+$/.test(t)) return true;
  if (/^(canva editor|changes will be saved|skip navigation|skip to main content|viewing|page thumbnails)/i.test(t)) return true;
  if (/^(skip to end of page thumbnails|back to start of page thumbnails|the main navigation contains)/i.test(t)) return true;
  if (/^(to switch between buttons|to skip to the canvas|this button opens the menu|kelompok \d+)/i.test(t)) return false; // simpan kelompok
  if (t.includes('page-navigator-start') || t.includes('page-navigator-end') || t.includes('ctrl+f2')) return true;
  return false;
}

/**
 * Ekstraksi Khusus Canva Presentation
 */
async function extractCanvaPresentation(rawUrl) {
  let targetUrl = rawUrl.trim();

  // 1. Resolve redirect untuk shortlink canva.link/...
  if (targetUrl.includes('canva.link') || !targetUrl.includes('/view')) {
    try {
      const redirectRes = await axios.get(targetUrl, {
        maxRedirects: 10,
        headers: BROWSER_HEADERS,
        validateStatus: () => true,
        timeout: 8000
      });
      if (redirectRes.request?.res?.responseUrl) {
        targetUrl = redirectRes.request.res.responseUrl;
      }
    } catch {}
  }

  // Ubah /edit menjadi /view jika link yang disalin adalah link editor
  targetUrl = targetUrl.replace(/\/edit(\?.*)?$/i, '/view$1');
  if (!targetUrl.includes('/view') && targetUrl.includes('canva.com/design/')) {
    targetUrl = targetUrl.split('?')[0] + '/view';
  }

  // 2. Fetch via Jina Reader AI (Mampu mengeksekusi JS render slide Canva)
  const jinaUrl = `https://r.jina.ai/${encodeURI(targetUrl)}`;
  const jinaRes = await axios.get(jinaUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 20000
  });

  const markdown = typeof jinaRes.data === 'string' ? jinaRes.data : '';
  if (!markdown || markdown.length < 100) {
    throw new Error('Tidak dapat membaca konten presentasi Canva.');
  }

  // Ekstrak Judul Dokumen
  let title = 'Presentasi Canva';
  const titleMatch = markdown.match(/^Title:\s*(.+)$/m);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].replace(/ - Canva$/i, '').trim();
  }

  // Cari teks penting (misal Subjudul / Topik)
  const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);
  const cleanBodyLines = [];
  for (const line of lines) {
    if (line.startsWith('Title:') || line.startsWith('URL Source:') || line.startsWith('Published Time:') || line.startsWith('Markdown Content:')) continue;
    if (isCanvaBoilerplate(line)) continue;
    cleanBodyLines.push(line);
  }

  // 3. Ekstrak Semua Gambar Slide
  // Format Jina untuk Canva: * ![Image 1](https://media.canva.com/v2/document-image/...page=1...) 1
  const imageRegex = /!\[Image \d+\]\((https:\/\/[^\s\)]+)\)/g;
  const slideImages = [];
  let match;
  while ((match = imageRegex.exec(markdown)) !== null) {
    const imgUrl = match[1];
    if (imgUrl.includes('document-image') || imgUrl.includes('thumbnail') || imgUrl.includes('canva.com')) {
      if (!slideImages.includes(imgUrl)) {
        slideImages.push(imgUrl);
      }
    }
  }

  // Deteksi jumlah slide asli (misal: * 15 di akhir thumbnail list)
  let detectedPageCount = slideImages.length;
  const pageNumberMatches = [...markdown.matchAll(/\*\s+(\d{1,3})\b/g)].map(m => parseInt(m[1], 10));
  if (pageNumberMatches.length > 0) {
    const maxPage = Math.max(...pageNumberMatches);
    if (maxPage > detectedPageCount && maxPage <= 100) {
      detectedPageCount = maxPage;
    }
  }

  const pages = [];
  const totalSlides = Math.max(detectedPageCount, 1);

  // Bagi paragraf teks bersih ke slide yang sesuai
  const paragraphsPerSlide = Math.max(1, Math.ceil(cleanBodyLines.length / totalSlides));

  for (let i = 1; i <= totalSlides; i++) {
    const imgUrl = slideImages[i - 1] || slideImages[0] || null;
    const startIdx = (i - 1) * paragraphsPerSlide;
    const slideTextLines = cleanBodyLines.slice(startIdx, startIdx + paragraphsPerSlide);
    const slideText = slideTextLines.join('\n\n') || `Slide Presentasi ${i}`;

    pages.push({
      pageNumber: i,
      title: i === 1 ? title : `Slide ${i}`,
      text: slideText,
      paragraphs: slideTextLines.length > 0 ? slideTextLines : [slideText],
      imageUrl: imgUrl
    });
  }

  return {
    success: true,
    source: 'canva',
    title,
    totalPages: pages.length,
    pages,
    hasPageImages: slideImages.length > 0,
    sourceUrl: rawUrl,
    extractedAt: new Date().toISOString()
  };
}

/**
 * Ekstraksi Dokumen Scribd
 */
async function extractScribd(url) {
  const match = url.match(/scribd\.com\/(?:doc|document|presentation|embeds)\/(\d+)/i);
  const docId = match ? match[1] : null;

  if (!docId) {
    throw new Error('Link Scribd tidak valid.');
  }

  // 1. Coba Direct Social Bot Crawler
  try {
    const directRes = await axios.get(`https://www.scribd.com/document/${docId}`, {
      headers: SOCIAL_BOT_HEADERS,
      timeout: 10000
    });

    const html = directRes.data || '';
    const $ = cheerio.load(html);
    const title = $('title').text().replace(/\|\s*PDF.*$/i, '').replace(/- Scribd$/i, '').trim() || `Dokumen Scribd #${docId}`;

    const thumbnailUrls = [];
    $('[data-e2e="bot-thumbnail-image"]').each((idx, el) => {
      const src = $(el).attr('src');
      if (src) thumbnailUrls.push({ page: idx + 1, url: src });
    });

    if (thumbnailUrls.length === 0) {
      const regex = /https:\/\/screenshots\.scribd\.com\/Scribd\/[^\s"'<>\)]+/g;
      const matches = [...new Set([...html.matchAll(regex)].map(m => m[0]))];
      matches.forEach((u, idx) => thumbnailUrls.push({ page: idx + 1, url: u }));
    }

    if (thumbnailUrls.length > 0) {
      const pages = thumbnailUrls.map(item => ({
        pageNumber: item.page,
        title: item.page === 1 ? title : `Halaman ${item.page}`,
        text: `Konten Halaman ${item.page}`,
        paragraphs: [`Konten Halaman ${item.page}`],
        imageUrl: item.url
      }));

      return {
        success: true,
        source: 'scribd',
        title,
        totalPages: pages.length,
        pages,
        hasPageImages: true,
        sourceUrl: url,
        extractedAt: new Date().toISOString()
      };
    }
  } catch {}

  // 2. Fallback via Jina Reader
  const jinaRes = await axios.get(`https://r.jina.ai/${encodeURI(url)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 16000
  });

  const markdown = jinaRes.data || '';
  const lines = markdown.split('\n').filter(l => l.trim().length > 0);
  let title = `Dokumen Scribd #${docId}`;
  const tMatch = markdown.match(/^Title:\s*(.+)$/m);
  if (tMatch) title = tMatch[1].replace(/- Scribd$/i, '').trim();

  const paragraphs = lines.filter(l => !l.startsWith('Title:') && !l.startsWith('URL Source:') && !l.startsWith('Markdown Content:') && l.length > 15);
  const pages = [];
  for (let i = 0; i < Math.max(paragraphs.length, 1); i += 4) {
    const chunk = paragraphs.slice(i, i + 4);
    pages.push({
      pageNumber: pages.length + 1,
      title: pages.length === 0 ? title : `Halaman ${pages.length + 1}`,
      text: chunk.join('\n\n') || 'Isi dokumen Scribd',
      paragraphs: chunk,
      imageUrl: null
    });
  }

  return {
    success: true,
    source: 'scribd',
    title,
    totalPages: pages.length,
    pages,
    hasPageImages: false,
    sourceUrl: url,
    extractedAt: new Date().toISOString()
  };
}

/**
 * Fallback Web Document
 */
async function extractGeneralWeb(url) {
  const jinaRes = await axios.get(`https://r.jina.ai/${encodeURI(url)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000
  });

  const markdown = jinaRes.data || '';
  let title = 'Dokumen Web';
  const tMatch = markdown.match(/^Title:\s*(.+)$/m);
  if (tMatch) title = tMatch[1].trim();

  const paragraphs = markdown.split('\n\n').map(p => p.trim()).filter(p => p.length > 20 && !p.startsWith('Title:') && !p.startsWith('URL Source:'));
  const pages = [];
  for (let i = 0; i < Math.max(paragraphs.length, 1); i += 4) {
    const chunk = paragraphs.slice(i, i + 4);
    pages.push({
      pageNumber: pages.length + 1,
      title: pages.length === 0 ? title : `Bagian ${pages.length + 1}`,
      text: chunk.join('\n\n'),
      paragraphs: chunk,
      imageUrl: null
    });
  }

  return {
    success: true,
    source: 'web',
    title,
    totalPages: pages.length,
    pages,
    hasPageImages: false,
    sourceUrl: url,
    extractedAt: new Date().toISOString()
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const url = req.body?.url || req.query?.url;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Mohon masukkan tautan/link dokumen yang ingin dikonversi.'
      });
    }

    const cleanUrl = url.trim();
    let result = null;

    if (cleanUrl.includes('canva.com') || cleanUrl.includes('canva.link')) {
      result = await extractCanvaPresentation(cleanUrl);
    } else if (cleanUrl.includes('scribd.com')) {
      result = await extractScribd(cleanUrl);
    } else {
      result = await extractGeneralWeb(cleanUrl);
    }

    return res.status(200).json({
      success: true,
      message: 'Berhasil mengekstrak konten dokumen.',
      data: result
    });
  } catch (err) {
    console.error('Error link-to-doc handler:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message || 'Gagal memproses dokumen dari link tersebut.'
    });
  }
}
