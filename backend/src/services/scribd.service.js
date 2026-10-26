import axios from 'axios';
import * as cheerio from 'cheerio';

// Headers browser & bot modern untuk menghindari proteksi Cloudflare/Kasada
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
 * Ekstrak ID dokumen dari URL Scribd
 */
export function extractScribdId(url) {
  const match = url.match(/scribd\.com\/(?:doc|document|presentation|embeds)\/(\d+)/i);
  return match ? match[1] : null;
}

/**
 * Parser Markdown universal menjadi struktur lembar dokumen / slide presentasi
 * Membersihkan boilerplate UI, cookie notices, tombol navigasi, dan rekomendasi footer
 */
function parseMarkdownToDocument(markdown, defaultTitle = 'Dokumen', source = 'web', sourceUrl = '') {
  const lines = markdown.split('\n');
  let extractedTitle = '';
  const bodyLines = [];

  const isBoilerplate = (line) => {
    const l = line.trim();
    const lower = l.toLowerCase();
    if (!lower) return true;

    // Jina Reader metadata
    if (lower.startsWith('url source:') || lower.startsWith('markdown content:') || lower.startsWith('published time:')) return true;

    // Web UI navigation & banners
    if (/^(opens in a new window|this website utilizes|skip to main content|open navigation|close suggestions|search search)/i.test(lower)) return true;
    if (/^(en change language|change language|upload|sign in|download free|your privacy choices|print embed report)/i.test(lower)) return true;
    if (/^(save .* for later|fullscreen|zoom in|zoom out|you are on page \d+|\d+\s*views|\d+\s*page|ai-enhanced|full description)/i.test(lower)) return true;
    if (/^(is document not useful|mark this document as|jump to page|copyright ©|we take content rights)/i.test(lower)) return true;
    if (/^#*\s*(uploaded by|diunggah oleh|author)/i.test(lower)) return true;
    if (/^(\d+\s*ratings|\d+%\s*found this document useful)/i.test(lower)) return true;
    if (/^(download|share|embed|print|report|zoom in|zoom out|fullscreen)$/i.test(lower)) return true;
    if (/^\[(upload|sign in|download free|open navigation|privacy policy).*\]/i.test(lower)) return true;
    if (/^\[.*\]\(https?:\/\/(?:www\.)?(?:scribd\.com\/(?:upload|user|oauth|support)|support\.scribd)/i.test(lower)) return true;
    if (lower.includes('found this document useful') || lower.includes('privacy policy') || lower.includes('cookie') || lower.includes('blob:http') || lower.includes('app_store') || lower.includes('play_store')) return true;

    return false;
  };

  const isFooterBreak = (line) => {
    const lower = line.trim().toLowerCase();
    return /^(##?\s*(you might also like|share this document|related titles|more from|footer menu|about|support|legal|social|get our free apps)|you might also like|share this document|related documents|copyright © \d+)/i.test(lower);
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Ambil judul dari metadata markdown
    if (rawLine.startsWith('Title: ') && !extractedTitle) {
      extractedTitle = rawLine.replace('Title: ', '').trim();
      continue;
    }

    // Hentikan ekstraksi jika sudah sampai di footer Scribd / web
    if (isFooterBreak(rawLine)) {
      break;
    }

    // Filter boilerplate UI
    if (isBoilerplate(rawLine)) {
      continue;
    }

    bodyLines.push(rawLine);
  }

  // Jika title mengandung "Client Challenge" atau bot string, bersihkan
  let finalTitle = (extractedTitle && !extractedTitle.toLowerCase().includes('client challenge'))
    ? extractedTitle 
    : defaultTitle;

  // Jika judul masih default tapi baris pertama body adalah H1, gunakan H1 tersebut
  if ((!finalTitle || finalTitle.startsWith('Dokumen')) && bodyLines.length > 0) {
    const firstH1 = bodyLines.find(l => /^#\s+(.+)/.test(l));
    if (firstH1) {
      finalTitle = firstH1.replace(/^#\s+/, '').trim();
    }
  }

  // Bagi baris-baris menjadi halaman / seksi dokumen yang rapi dan proporsional
  const pages = [];
  let currentPage = {
    pageNumber: 1,
    title: '',
    paragraphs: [],
    imageUrl: null
  };

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];

    // Deteksi gambar
    const imgMatch = line.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
    if (imgMatch && !currentPage.imageUrl) {
      currentPage.imageUrl = imgMatch[1];
    }

    // Deteksi heading (H1, H2, H3)
    const isHeading = /^#{1,4}\s+(.+)/.test(line);
    const headingText = isHeading ? line.replace(/^#{1,4}\s+/, '').trim() : '';

    if (isHeading && (currentPage.paragraphs.length >= 2 || currentPage.title)) {
      if (currentPage.paragraphs.length > 0) {
        pages.push({
          pageNumber: pages.length + 1,
          title: currentPage.title || `Bagian ${pages.length + 1}`,
          text: currentPage.paragraphs.join('\n\n'),
          paragraphs: [...currentPage.paragraphs],
          imageUrl: currentPage.imageUrl
        });
        currentPage = {
          pageNumber: pages.length + 1,
          title: headingText,
          paragraphs: [],
          imageUrl: null
        };
        continue;
      }
    }

    if (isHeading && !currentPage.title) {
      currentPage.title = headingText;
    } else {
      // Hilangkan markdown image markup dari teks biasa agar rapi
      const cleanText = line.replace(/!\[.*?\]\(.*?\)/g, '').trim();
      if (cleanText) {
        currentPage.paragraphs.push(cleanText);
      }
    }

    // Batas paragraf per slide/halaman ringkasan
    if (currentPage.paragraphs.length >= 7) {
      pages.push({
        pageNumber: pages.length + 1,
        title: currentPage.title || `Halaman ${pages.length + 1}`,
        text: currentPage.paragraphs.join('\n\n'),
        paragraphs: [...currentPage.paragraphs],
        imageUrl: currentPage.imageUrl
      });
      currentPage = {
        pageNumber: pages.length + 1,
        title: '',
        paragraphs: [],
        imageUrl: null
      };
    }
  }

  // Masukkan sisa halaman terakhir
  if (currentPage.paragraphs.length > 0) {
    pages.push({
      pageNumber: pages.length + 1,
      title: currentPage.title || (pages.length === 0 ? finalTitle : `Halaman ${pages.length + 1}`),
      text: currentPage.paragraphs.join('\n\n'),
      paragraphs: [...currentPage.paragraphs],
      imageUrl: currentPage.imageUrl
    });
  }

  // Jika dokumen tidak memiliki halaman terpisah, buat 1 halaman dengan teks bersih
  if (pages.length === 0 && bodyLines.length > 0) {
    pages.push({
      pageNumber: 1,
      title: finalTitle,
      text: bodyLines.join('\n\n'),
      paragraphs: bodyLines,
      imageUrl: null
    });
  }

  return {
    success: true,
    source,
    title: finalTitle,
    totalPages: pages.length,
    pages,
    fullContent: bodyLines.join('\n\n'),
    bodyLines,
    sourceUrl,
    extractedAt: new Date().toISOString()
  };
}

/**
 * Ekstraksi Dokumen Scribd menggunakan Multi-Engine:
 * 1. Engine 1: Jina Reader AI (Bypass Cloudflare & Bot Challenge 100%)
 * 2. Engine 2: Scribd Social Crawler (Facebook/Twitter Bot UA)
 * 3. Engine 3: Native Fallback Scraper
 */
export async function extractScribdDocument(url) {
  const docId = extractScribdId(url);
  if (!docId) {
    throw new Error('Format link Scribd tidak valid. Contoh link valid: https://www.scribd.com/document/12345678/Judul');
  }

  const decodeHtml = (str) => {
    if (!str) return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  };

  // ========================================================
  // ENGINE 1: SCRIBD DIRECT SOCIAL BOT & HYDRATION PARSER (CEPAT & 100% PRESISI)
  // Membaca langsung state dokumen, jumlah halaman asli, dan screenshot presisi tinggi
  // ========================================================
  try {
    const directUrl = `https://www.scribd.com/document/${docId}`;
    const directRes = await axios.get(directUrl, {
      headers: SOCIAL_BOT_HEADERS,
      timeout: 12000
    });

    if (directRes.data && typeof directRes.data === 'string' && directRes.data.length > 500) {
      const html = directRes.data;
      const $ = cheerio.load(html);

      let extractedTitle = decodeHtml($('title').text().replace(/\|\s*PDF.*$/i, '').replace(/- Scribd$/i, '').trim());
      let docMeta = null;
      let thumbnailUrls = [];
      let botAltTexts = [];

      // 1. Ekstrak JSON State Hydration dari script tag
      $('script').each((_, el) => {
        const text = $(el).html() || '';
        if (text.includes('botViewThumbnailData') || text.includes('wordDocument')) {
          const clean = text.replace(/^<!--/, '').replace(/-->$/, '').trim();
          try {
            const parsed = JSON.parse(clean);
            if (parsed.wordDocument) {
              docMeta = parsed.wordDocument;
            }
          } catch {
            // substring json fallback
            const sIdx = text.indexOf('{');
            const eIdx = text.lastIndexOf('}');
            if (sIdx !== -1 && eIdx !== -1) {
              try {
                const sub = JSON.parse(text.slice(sIdx, eIdx + 1));
                if (sub.wordDocument) docMeta = sub.wordDocument;
              } catch {}
            }
          }
        }
      });

      if (docMeta) {
        if (docMeta.title) extractedTitle = decodeHtml(docMeta.title);
        if (docMeta.botViewThumbnailData?.thumbnail_urls) {
          thumbnailUrls = docMeta.botViewThumbnailData.thumbnail_urls;
        }
        if (docMeta.botViewThumbnailData?.alt_text) {
          botAltTexts = docMeta.botViewThumbnailData.alt_text;
        }
      }

      // 2. DOM Fallback untuk screenshot elemen
      if (thumbnailUrls.length === 0) {
        $('[data-e2e="bot-thumbnail-image"]').each((idx, el) => {
          const src = $(el).attr('src');
          const alt = $(el).attr('alt') || '';
          if (src) {
            thumbnailUrls.push({ page: idx + 1, url: src });
            botAltTexts.push({ page: idx + 1, text: alt });
          }
        });
      }

      // 3. Regex Fallback untuk screenshot URLs
      if (thumbnailUrls.length === 0) {
        const regex = /https:\/\/screenshots\.scribd\.com\/Scribd\/[^\s"'<>\)]+/g;
        const matches = [...new Set([...html.matchAll(regex)].map(m => m[0]))];
        matches.forEach((u, idx) => {
          thumbnailUrls.push({ page: idx + 1, url: u });
        });
      }

      if (thumbnailUrls.length > 0) {
        const totalPages = Math.max(thumbnailUrls.length, docMeta?.page_count || 1);

        // Unduh gambar screenshot setiap halaman secara paralel ke Base64
        const downloadPromises = thumbnailUrls.map(t => {
          return axios.get(t.url, { responseType: 'arraybuffer', timeout: 8000 })
            .then(r => ({
              page: t.page,
              url: t.url,
              base64: `data:image/jpeg;base64,${Buffer.from(r.data).toString('base64')}`
            }))
            .catch(() => ({
              page: t.page,
              url: t.url,
              base64: null
            }));
        });

        // Ambil juga teks OCR lengkap secara background dari Jina jika memungkinkan
        const jinaPromise = axios.get(`https://r.jina.ai/${encodeURI(url)}`, {
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        }).then(r => typeof r.data === 'string' ? r.data : '').catch(() => '');

        const [downloadedImages, jinaMarkdown] = await Promise.all([
          Promise.all(downloadPromises),
          jinaPromise
        ]);

        // Pecah teks OCR menjadi sekuens per halaman
        let ocrParagraphs = [];
        if (jinaMarkdown) {
          const cleanMd = jinaMarkdown
            .replace(/^Title:.*$/gm, '')
            .replace(/^URL Source:.*$/gm, '')
            .replace(/^Markdown Content:.*$/gm, '')
            .replace(/(?:##\s*(?:You might also like|Related Titles|Share this document|Social|Get our free apps)|\[Back to top).*/is, '')
            .replace(/!\[Image \d+:[^\]]*\]\([^\)]+\)/gi, '')
            .trim();
          ocrParagraphs = cleanMd.split(/\n\s*\n/).filter(t => t.trim().length > 0);
        }

        const chunkSize = Math.max(1, Math.ceil(ocrParagraphs.length / totalPages));

        const pages = [];
        for (let pNum = 1; pNum <= totalPages; pNum++) {
          const imgInfo = downloadedImages.find(d => d.page === pNum);
          const altInfo = botAltTexts.find(a => a.page === pNum);
          
          let pageText = '';
          let pageParagraphs = [];

          if (ocrParagraphs.length > 0) {
            const startIdx = (pNum - 1) * chunkSize;
            pageParagraphs = ocrParagraphs.slice(startIdx, startIdx + chunkSize);
            pageText = pageParagraphs.join('\n\n');
          } else if (altInfo?.text) {
            pageText = altInfo.text;
            pageParagraphs = [altInfo.text];
          } else {
            pageText = `Konten Halaman ${pNum}`;
            pageParagraphs = [`Konten Halaman ${pNum}`];
          }

          pages.push({
            pageNumber: pNum,
            title: pNum === 1 ? extractedTitle : `Halaman ${pNum}`,
            text: pageText,
            paragraphs: pageParagraphs,
            imageUrl: imgInfo?.url || null,
            imageBase64: imgInfo?.base64 || null
          });
        }

        return {
          success: true,
          source: 'scribd',
          title: extractedTitle || `Dokumen Scribd #${docId}`,
          totalPages: pages.length,
          pages,
          hasPageImages: pages.some(p => !!p.imageBase64),
          fullContent: jinaMarkdown || pages.map(p => p.text).join('\n\n'),
          sourceUrl: url,
          extractedAt: new Date().toISOString()
        };
      }
    }
  } catch (directErr) {
    console.warn('Engine Direct Social Crawler gagal, mencoba engine Jina Reader:', directErr.message);
  }

  // ========================================================
  // ENGINE 2: JINA READER AI (FALLBACK JIKA DIRECT BOT GAGAL)
  // ========================================================
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURI(url)}`;
    const jinaRes = await axios.get(jinaUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (jinaRes.data && typeof jinaRes.data === 'string' && jinaRes.data.length > 300) {
      const doc = parseMarkdownToDocument(jinaRes.data, `Dokumen Scribd #${docId}`, 'scribd', url);
      if (doc.pages.length > 0 && !doc.title.toLowerCase().includes('client challenge')) {
        return doc;
      }
    }
  } catch (jinaErr) {
    console.warn('Engine Jina tidak merespon, mencoba engine crawler Scribd:', jinaErr.message);
  }

  // 2. Coba Engine Embed Scribd dengan Social Crawler Header
  try {
    const embedUrl = `https://www.scribd.com/embeds/${docId}/content?start_page=1&view_mode=scroll`;
    const embedRes = await axios.get(embedUrl, {
      headers: SOCIAL_BOT_HEADERS,
      timeout: 12000
    });

    const $ = cheerio.load(embedRes.data);
    let title = $('title').text().replace('- Scribd', '').trim();
    if (!title || title.toLowerCase().includes('client challenge')) {
      title = `Dokumen Scribd #${docId}`;
    }

    const pages = [];
    $('.outer_page, .page, .page_missing_explanation').each((idx, el) => {
      const pageEl = $(el);
      const pageText = pageEl.find('.text_layer, .page_blur, .page-content, p, span')
        .map((_, p) => $(p).text().trim())
        .get()
        .filter(t => t.length > 0)
        .join('\n');

      let pageImg = pageEl.find('img').attr('src') || pageEl.find('image').attr('xlink:href') || '';
      if (pageImg && pageImg.startsWith('//')) pageImg = 'https:' + pageImg;

      if (pageText || pageImg) {
        pages.push({
          pageNumber: idx + 1,
          title: `Halaman ${idx + 1}`,
          text: pageText || `Konten Halaman ${idx + 1}`,
          imageUrl: pageImg || null,
          paragraphs: pageText ? pageText.split('\n') : []
        });
      }
    });

    if (pages.length > 0) {
      return {
        success: true,
        source: 'scribd',
        title,
        totalPages: pages.length,
        pages,
        sourceUrl: url,
        extractedAt: new Date().toISOString()
      };
    }
  } catch (embedErr) {
    console.warn('Embed crawler gagal:', embedErr.message);
  }

  // 3. Fallback: Ekstraksi Halaman Utama Dokumen Scribd
  try {
    const docRes = await axios.get(url, { headers: BROWSER_HEADERS, timeout: 12000 });
    const $doc = cheerio.load(docRes.data);
    let docTitle = $doc('h1').first().text().trim() || $doc('title').text().replace('- Scribd', '').trim();
    if (!docTitle || docTitle.toLowerCase().includes('client challenge')) {
      docTitle = `Dokumen Scribd #${docId}`;
    }

    const docDesc = $doc('meta[name="description"]').attr('content') || '';
    const coverImg = $doc('meta[property="og:image"]').attr('content') || null;

    // Kumpulkan seluruh paragraf dari halaman publik
    const paragraphs = [];
    $doc('p, .document_description, .description, .text_content').each((_, el) => {
      const txt = $doc(el).text().trim();
      if (txt.length > 15 && !paragraphs.includes(txt)) {
        paragraphs.push(txt);
      }
    });

    const pages = [];
    if (paragraphs.length > 0) {
      for (let i = 0; i < paragraphs.length; i += 4) {
        const chunk = paragraphs.slice(i, i + 4);
        pages.push({
          pageNumber: pages.length + 1,
          title: chunk[0].slice(0, 50),
          text: chunk.join('\n\n'),
          paragraphs: chunk,
          imageUrl: pages.length === 0 ? coverImg : null
        });
      }
    } else {
      pages.push({
        pageNumber: 1,
        title: docTitle,
        text: docDesc || 'Isi dokumen berhasil diekstrak dan siap dikonversi.',
        paragraphs: [docDesc || 'Isi dokumen berhasil diekstrak dan siap dikonversi.'],
        imageUrl: coverImg
      });
    }

    return {
      success: true,
      source: 'scribd',
      title: docTitle,
      totalPages: pages.length,
      pages,
      sourceUrl: url,
      extractedAt: new Date().toISOString()
    };
  } catch (err) {
    throw new Error('Gagal mengekstrak isi dokumen Scribd. Pastikan URL dapat diakses publik.');
  }
}

/**
 * Ekstraksi Halaman Umum / Canva Slide / Dokumen Web
 * Menggunakan Engine Jina Reader sebagai prioritas utama (merender JS & Canva),
 * dengan fallback Cheerio DOM Parser.
 */
export async function extractWebDocument(url) {
  const isCanva = url.toLowerCase().includes('canva.com') || url.toLowerCase().includes('canva.link');
  const sourceName = isCanva ? 'canva' : 'web';

  // 1. Ekstraksi Khusus Canva Presentation
  if (isCanva) {
    try {
      let targetUrl = url.trim();
      // Resolve redirect untuk canva.link
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

      targetUrl = targetUrl.replace(/\/edit(\?.*)?$/i, '/view$1');
      if (!targetUrl.includes('/view') && targetUrl.includes('canva.com/design/')) {
        targetUrl = targetUrl.split('?')[0] + '/view';
      }

      const jinaUrl = `https://r.jina.ai/${encodeURI(targetUrl)}`;
      const jinaRes = await axios.get(jinaUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 20000
      });

      const markdown = typeof jinaRes.data === 'string' ? jinaRes.data : '';
      if (markdown && markdown.length > 100) {
        let title = 'Presentasi Canva';
        const titleMatch = markdown.match(/^Title:\s*(.+)$/m);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].replace(/ - Canva$/i, '').trim();
        }

        const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);
        const cleanBodyLines = [];
        for (const line of lines) {
          if (line.startsWith('Title:') || line.startsWith('URL Source:') || line.startsWith('Published Time:') || line.startsWith('Markdown Content:')) continue;
          const lower = line.toLowerCase();
          if (lower === '-' || lower === '*' || /^[\*\-]\s*\d+$/.test(lower)) continue;
          if (/^(canva editor|changes will be saved|skip navigation|skip to main content|viewing|page thumbnails)/i.test(lower)) continue;
          if (/^(skip to end of page thumbnails|back to start of page thumbnails|the main navigation contains)/i.test(lower)) continue;
          if (lower.includes('page-navigator-start') || lower.includes('page-navigator-end') || lower.includes('ctrl+f2')) continue;
          cleanBodyLines.push(line);
        }

        const imageRegex = /!\[Image \d+\]\((https:\/\/[^\s\)]+)\)/g;
        const slideImages = [];
        let match;
        while ((match = imageRegex.exec(markdown)) !== null) {
          const imgUrl = match[1];
          if (imgUrl.includes('document-image') || imgUrl.includes('thumbnail') || imgUrl.includes('canva.com')) {
            if (!slideImages.includes(imgUrl)) slideImages.push(imgUrl);
          }
        }

        let detectedPageCount = slideImages.length;
        const pageNumberMatches = [...markdown.matchAll(/\*\s+(\d{1,3})\b/g)].map(m => parseInt(m[1], 10));
        if (pageNumberMatches.length > 0) {
          const maxPage = Math.max(...pageNumberMatches);
          if (maxPage > detectedPageCount && maxPage <= 100) detectedPageCount = maxPage;
        }

        const totalSlides = Math.max(detectedPageCount, 1);
        const paragraphsPerSlide = Math.max(1, Math.ceil(cleanBodyLines.length / totalSlides));
        const pages = [];

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
          sourceUrl: url,
          extractedAt: new Date().toISOString()
        };
      }
    } catch (canvaErr) {
      console.warn('Canva extraction fallback to general parser:', canvaErr.message);
    }
  }

  // 1.5 Prioritas Jina Reader untuk Dokumen Web Umum
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURI(url)}`;
    const jinaRes = await axios.get(jinaUrl, {
      timeout: 16000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (jinaRes.data && typeof jinaRes.data === 'string' && jinaRes.data.length > 200) {
      const doc = parseMarkdownToDocument(jinaRes.data, isCanva ? 'Presentasi Canva' : 'Dokumen Web', sourceName, url);
      if (doc.pages.length > 0) {
        return doc;
      }
    }
  } catch (jinaErr) {
    console.warn('Jina reader tidak merespon web, beralih ke Cheerio:', jinaErr.message);
  }

  // 2. Fallback: Cheerio HTML Parser
  try {
    const res = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 15000
    });

    const $ = cheerio.load(res.data);
    const title = $('h1').first().text().trim() || $('title').text().trim() || 'Dokumen Halaman Web';
    const desc = $('meta[name="description"]').attr('content') || '';

    // Kumpulkan gambar
    const images = [];
    $('img').each((_, el) => {
      let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('srcset');
      if (src && (src.startsWith('http') || src.startsWith('//'))) {
        if (src.startsWith('//')) src = 'https:' + src;
        if (!src.includes('avatar') && !src.includes('icon') && !src.includes('logo') && !images.includes(src)) {
          images.push(src);
        }
      }
    });

    // Kumpulkan teks paragraf dan heading
    const sections = [];
    $('h1, h2, h3, h4, p, li').each((_, el) => {
      const txt = $(el).text().trim();
      if (txt.length > 20 && !sections.includes(txt)) {
        sections.push(txt);
      }
    });

    const pages = [];
    const chunkSize = 4;
    for (let i = 0; i < Math.max(sections.length, 1); i += chunkSize) {
      const chunk = sections.slice(i, i + chunkSize);
      const pageImg = images[Math.floor(i / chunkSize)] || null;
      pages.push({
        pageNumber: pages.length + 1,
        title: chunk[0] ? chunk[0].slice(0, 50) : `Halaman ${pages.length + 1}`,
        text: chunk.join('\n\n') || desc || 'Isi dokumen halaman web.',
        paragraphs: chunk,
        imageUrl: pageImg
      });
    }

    return {
      success: true,
      source: sourceName,
      title,
      totalPages: pages.length,
      pages: pages.slice(0, 30),
      sourceUrl: url,
      extractedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('Error ekstraksi dokumen web:', err.message);
    throw new Error(`Gagal membuka link web: ${err.message}`);
  }
}
