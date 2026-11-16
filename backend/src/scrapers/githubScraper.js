import axios from 'axios';
import * as cheerio from 'cheerio';

const profileCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function resolveGithubUsername(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();
  const urlMatch = str.match(/github\.com\/([a-zA-Z0-9_\-]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].replace(/\/.*$/, '').trim();
  }
  return str.replace(/^@+/, '').split(/[\/\?\s]/)[0].trim();
}

function formatDate(isoString) {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

export async function scrapeGithub(rawInput, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh || options.refresh);
  const username = resolveGithubUsername(rawInput);

  if (!username) {
    return {
      success: false,
      statusCode: 400,
      error: 'invalid_username',
      message: 'Username atau tautan GitHub tidak valid.'
    };
  }

  const cacheKey = username.toLowerCase();
  const cached = profileCache.get(cacheKey);
  if (!forceRefresh && cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return {
      success: true,
      platform: 'github',
      source: 'memory_cache',
      cached: true,
      data: cached.data
    };
  }

  let mappedData = null;
  let sourceEngine = 'api_rest';

  // 1. Engine 1: Official GitHub REST API
  try {
    const userRes = await axios.get(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      timeout: 8000,
      validateStatus: (status) => status < 500,
      headers: {
        'User-Agent': 'KuroStudio-OSINT-Scraper/1.0',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (userRes.status === 404) {
      return {
        success: false,
        statusCode: 404,
        error: 'user_not_found',
        message: `Akun GitHub @${username} tidak ditemukan.`
      };
    }

    if (userRes.status === 200 && userRes.data?.login) {
      const u = userRes.data;

      // Hitung total stars dari repositori publik
      let totalStars = 0;
      try {
        const reposRes = await axios.get(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed`, {
          timeout: 6000,
          headers: { 'User-Agent': 'KuroStudio-OSINT-Scraper/1.0' }
        });
        if (Array.isArray(reposRes.data)) {
          totalStars = reposRes.data.reduce((acc, r) => acc + (r.stargazers_count || 0), 0);
        }
      } catch (_) {}

      mappedData = {
        username: u.login,
        nickname: u.name || u.login,
        avatar: u.avatar_url || '',
        bio: u.bio || '',
        status: u.hireable ? 'Hireable' : 'Public Developer',
        followers: Number(u.followers || 0),
        following: Number(u.following || 0),
        publicRepos: Number(u.public_repos || 0),
        totalStars,
        publicGists: Number(u.public_gists || 0),
        location: u.location || '',
        company: u.company || '',
        blog: u.blog ? (u.blog.startsWith('http') ? u.blog : `https://${u.blog}`) : '',
        createTime: formatDate(u.created_at),
        profileUrl: u.html_url || `https://github.com/${u.login}`
      };
      sourceEngine = 'github_rest_api';
    }
  } catch (err) {
    if (err.response?.status === 404) {
      return {
        success: false,
        statusCode: 404,
        error: 'user_not_found',
        message: `Akun GitHub @${username} tidak ditemukan.`
      };
    }
  }

  // 2. Engine 2: Cheerio HTML Scraping Fallback
  if (!mappedData) {
    try {
      const pageRes = await axios.get(`https://github.com/${encodeURIComponent(username)}`, {
        timeout: 8000,
        validateStatus: (status) => status < 500,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
      });

      if (pageRes.status === 404) {
        return {
          success: false,
          statusCode: 404,
          error: 'user_not_found',
          message: `Akun GitHub @${username} tidak ditemukan.`
        };
      }

      if (pageRes.status === 200 && pageRes.data) {
        const $ = cheerio.load(pageRes.data);
        const name = $('span.p-name').text().trim() || $('meta[property="profile:username"]').attr('content') || username;
        const nickname = $('span.p-nickname').text().trim() || username;
        const avatar = $('img.avatar-user').attr('src') || $('meta[property="og:image"]').attr('content') || '';
        const bio = $('div.p-note').text().trim() || $('meta[name="description"]').attr('content') || '';
        
        let followers = 0;
        let following = 0;
        $('a[href*="tab=followers"] span.text-bold').each((_, el) => {
          followers = parseInt($(el).text().replace(/[^0-9]/g, ''), 10) || 0;
        });
        $('a[href*="tab=following"] span.text-bold').each((_, el) => {
          following = parseInt($(el).text().replace(/[^0-9]/g, ''), 10) || 0;
        });

        let publicRepos = 0;
        $('span[data-search-type="Repositories"]').next('span.Counter').each((_, el) => {
          publicRepos = parseInt($(el).text().replace(/[^0-9]/g, ''), 10) || 0;
        });

        const location = $('li[itemprop="homeLocation"] span').text().trim() || '';
        const company = $('li[itemprop="worksFor"] span').text().trim() || '';
        const blog = $('li[itemprop="url"] a').attr('href') || '';

        mappedData = {
          username: nickname,
          nickname: name,
          avatar,
          bio,
          status: 'Public Developer',
          followers,
          following,
          publicRepos,
          totalStars: 0,
          publicGists: 0,
          location,
          company,
          blog,
          createTime: null,
          profileUrl: `https://github.com/${nickname}`
        };
        sourceEngine = 'github_html_cheerio';
      }
    } catch (_) {}
  }

  if (!mappedData) {
    return {
      success: false,
      statusCode: 502,
      error: 'fetch_failed',
      message: `Gagal mengambil informasi profil GitHub @${username}.`
    };
  }

  profileCache.set(cacheKey, {
    timestamp: Date.now(),
    data: mappedData
  });

  return {
    success: true,
    platform: 'github',
    source: sourceEngine,
    cached: false,
    data: mappedData
  };
}

export default scrapeGithub;
