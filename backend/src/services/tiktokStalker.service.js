import axios from 'axios';
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pengurai cerdas tautan & shortlink TikTok (vt/vm) menjadi username murni
export async function resolveTiktokUsername(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  let input = rawInput.trim();

  // Jika input berupa URL shortlink (vt.tiktok.com atau vm.tiktok.com)
  if (input.includes('vt.tiktok.com') || input.includes('vm.tiktok.com')) {
    try {
      const fullUrl = input.startsWith('http') ? input : `https://${input}`;
      const res = await axios.get(fullUrl, {
        maxRedirects: 5,
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
      });
      const resolved = res.request?.res?.responseUrl || res.config?.url;
      if (resolved) {
        input = resolved;
      }
    } catch (err) {
      if (err.response?.headers?.location) {
        input = err.response.headers.location;
      }
    }
  }

  // Jika berupa URL web profil atau video tiktok.com/@username
  const urlMatch = input.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].replace(/\/.*$/, '').trim();
  }

  // Jika diawali simbol @ (misal @kuro_studio)
  if (input.startsWith('@')) {
    return input.replace(/^@+/, '').split(/[\/\?\s]/)[0].trim();
  }

  // Jika username biasa tanpa protokol
  const clean = input.split(/[\/\?\s]/)[0].replace(/[^a-zA-Z0-9_.]/g, '');
  return clean;
}

// Fallback sekunder menggunakan Python scraper_fallback.py
function callPythonFallback(username) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'scraper_fallback.py');
    execFile('python', [scriptPath, username], { timeout: 10000 }, (err, stdout) => {
      if (err || !stdout) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.status && parsed.data) {
          resolve(parsed.data);
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
  });
}

// Layanan utama pelacak profil TikTok
export async function stalkTiktokProfile(rawInput) {
  const username = await resolveTiktokUsername(rawInput);

  if (!username) {
    return {
      success: false,
      error: 'invalid_username',
      message: 'Username atau tautan profil TikTok tidak valid. Mohon periksa kembali input Anda.'
    };
  }

  const profileUrl = `https://www.tiktok.com/@${username}`;
  let rawData = null;
  let dataSource = 'siputzx';

  // 1. Panggil Endpoint Utama (api.siputzx.my.id) dengan validasi Content-Type & Status
  try {
    const res = await axios.get(`https://api.siputzx.my.id/api/stalk/tiktok?username=${encodeURIComponent(username)}`, {
      timeout: 10000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    const contentType = res.headers['content-type'] || '';
    const isJson = contentType.toLowerCase().includes('application/json');

    if (res.status === 200 && isJson) {
      let bodyData = res.data;
      if (typeof bodyData === 'string') {
        try {
          bodyData = JSON.parse(bodyData);
        } catch {
          bodyData = null;
        }
      }
      if (bodyData && bodyData.status && bodyData.data) {
        rawData = bodyData.data;
        dataSource = 'siputzx';
      }
    }
  } catch (apiErr) {
    // Primary API down / timeout
  }

  // 2. Jika API siputzx gagal, coba fallback Python scraper
  if (!rawData) {
    try {
      const pyResult = await callPythonFallback(username);
      if (pyResult && (pyResult.avatar || pyResult.uniqueId || pyResult.nickname)) {
        rawData = pyResult;
        dataSource = 'python_scraper';
      }
    } catch {}
  }

  // 3. Jika API eksternal gagal dan scraper tidak mendapatkan data valid, kembalikan 502
  if (!rawData) {
    return {
      success: false,
      status: 'error',
      statusCode: 502,
      message: 'API TikTok eksternal sedang gangguan atau mengembalikan respons tidak valid.'
    };
  }
  const userObj = rawData?.user || rawData || {};
  const statsObj = rawData?.stats || rawData || {};

  const uniqueId = userObj.uniqueId || userObj.username || username;
  const nickname = userObj.nickname || uniqueId;
  const avatar = userObj.avatarLarger || userObj.avatar || userObj.avatarMedium || userObj.avatarThumb || '';
  const signature = userObj.signature || userObj.bio || '';
  const verified = Boolean(userObj.verified);
  const isPrivate = Boolean(userObj.privateAccount || userObj.isSecret);
  const secUid = userObj.secUid || '';
  const id = userObj.id || userObj.userId || '';
  const region = userObj.region || '';
  const bioLinkRaw = userObj.bioLink?.link || (typeof userObj.bioLink === 'string' ? userObj.bioLink : null);

  const followers = Number(statsObj.followerCount || statsObj.followers || 0);
  const following = Number(statsObj.followingCount || statsObj.following || 0);
  const likes = Number(statsObj.heartCount || statsObj.heart || statsObj.likes || 0);
  const videos = Number(statsObj.videoCount || statsObj.video || statsObj.videos || 0);
  const friends = Number(statsObj.friendCount || statsObj.friends || 0);

  return {
    success: true,
    source: dataSource,
    timestamp: new Date().toISOString(),
    data: {
      username: uniqueId,
      nickname,
      avatar,
      bio: signature,
      bioLink: bioLinkRaw,
      verified,
      privateAccount: isPrivate,
      id,
      secUid,
      region,
      profileUrl,
      stats: {
        followers,
        following,
        likes,
        videos,
        friends
      }
    }
  };
}
