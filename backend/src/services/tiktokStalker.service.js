import axios from 'axios';
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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
        headers: { 'User-Agent': UA_MOBILE }
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

// Scraper langsung ke web TikTok menggunakan Universal Data Rehydration (bypass WAF via mobile UA)
export async function scrapeTiktokRehydration(username) {
  const profileUrl = `https://www.tiktok.com/@${username}`;
  
  // Coba fetch dengan mobile UA (sangat efektif melewati WAF Challenge)
  try {
    const res = await axios.get(profileUrl, {
      timeout: 10000,
      validateStatus: (status) => status < 500,
      headers: {
        'User-Agent': UA_MOBILE,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
      }
    });

    if (res.status === 404) {
      return { notFound: true };
    }

    const html = typeof res.data === 'string' ? res.data : '';
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (match && match[1]) {
      const parsed = JSON.parse(match[1]);
      const defaultScope = parsed['__DEFAULT_SCOPE__'] || {};
      const userDetail = defaultScope['webapp.user-detail'] || {};
      const userInfo = userDetail.userInfo;
      if (userInfo && userInfo.user) {
        return {
          source: 'tiktok_rehydration',
          user: userInfo.user,
          stats: userInfo.stats || {}
        };
      }
    }
  } catch (err) {
    if (err.response?.status === 404) {
      return { notFound: true };
    }
  }

  return null;
}

// Ekstraktor multi-path untuk membaca payload beragam dari penyedia eksternal
function extractDeepProfile(raw, targetUsername) {
  if (!raw) return null;

  // Telusuri kemungkinan lokasi objek user dan stats
  const user = raw.data?.user || raw.result?.user || raw.userInfo?.user || raw.user || raw.data || raw;
  const stats = raw.data?.stats || raw.result?.stats || raw.userInfo?.stats || raw.stats || raw.data || raw;

  const username = user.uniqueId || user.username || targetUsername;
  const nickname = user.nickname || user.name || username;
  const avatar = user.avatarLarger || user.avatarMedium || user.avatarThumb || user.avatar || '';
  
  // Pertahankan karakter newline \n agar format bio multi-baris tampil sempurna
  const rawBio = user.signature || user.bio || '';
  const bio = typeof rawBio === 'string' ? rawBio : '';

  const verified = Boolean(user.verified || user.isVerified);
  const isPrivate = Boolean(user.privateAccount || user.isPrivate || user.isSecret);
  const secUid = user.secUid || '';
  const id = user.id || user.uid || user.userId || '';
  const region = user.region || '';
  const bioLink = user.bioLink?.link || (typeof user.bioLink === 'string' ? user.bioLink : null);

  const followers = Number(stats.followerCount ?? stats.followers ?? 0);
  const following = Number(stats.followingCount ?? stats.following ?? 0);
  
  // Tangani overflow signed 32-bit int di TikTok (misal 2.7 miliar heartCount menjadi negatif)
  let likes = 0;
  if (stats.heart && Number(stats.heart) > 0) {
    likes = Number(stats.heart);
  } else if (stats.heartCount && Number(stats.heartCount) > 0) {
    likes = Number(stats.heartCount);
  } else if (stats.likes) {
    likes = Number(stats.likes);
  }

  const videos = Number(stats.videoCount ?? stats.videos ?? 0);
  const friends = Number(stats.friendCount ?? stats.friends ?? 0);

  return {
    username,
    nickname,
    avatar,
    bio,
    bioLink,
    verified,
    privateAccount: isPrivate,
    id,
    secUid,
    region,
    profileUrl: `https://www.tiktok.com/@${username}`,
    stats: {
      followers,
      following,
      likes,
      videos,
      friends
    }
  };
}

// Layanan utama pelacak profil TikTok
export async function stalkTiktokProfile(rawInput) {
  const username = await resolveTiktokUsername(rawInput);

  if (!username) {
    return {
      success: false,
      status: 'error',
      statusCode: 400,
      error: 'invalid_username',
      message: 'Username atau tautan profil TikTok tidak valid. Mohon periksa kembali input Anda.'
    };
  }

  let rawData = null;
  let dataSource = 'rehydration';

  // 1. Eksekusi Scraper Rehydration Langsung (Sangat Akurat & Real-Time)
  const directResult = await scrapeTiktokRehydration(username);
  if (directResult) {
    if (directResult.notFound) {
      return {
        success: false,
        status: 'error',
        statusCode: 404,
        error: 'user_not_found',
        message: `Akun TikTok @${username} tidak ditemukan atau telah dihapus/diblokir.`
      };
    }
    rawData = directResult;
    dataSource = 'tiktok_rehydration';
  }

  // 2. Jika Scraper Langsung belum mendapatkan data, coba API primer siputzx
  if (!rawData) {
    try {
      const res = await axios.get(`https://api.siputzx.my.id/api/stalk/tiktok?username=${encodeURIComponent(username)}`, {
        timeout: 8000,
        validateStatus: () => true,
        headers: {
          'User-Agent': UA_DESKTOP,
          'Accept': 'application/json, text/plain, */*'
        }
      });

      const contentType = res.headers['content-type'] || '';
      if (res.status === 200 && contentType.toLowerCase().includes('application/json')) {
        let bodyData = res.data;
        if (typeof bodyData === 'string') {
          try { bodyData = JSON.parse(bodyData); } catch {}
        }
        if (bodyData && (bodyData.data || bodyData.result)) {
          rawData = bodyData;
          dataSource = 'siputzx';
        }
      }
    } catch (_) {}
  }

  // 3. Ekstraksi Deep Payload
  const parsedProfile = extractDeepProfile(rawData, username);

  // Jika akun tidak memiliki avatar, tidak ada id/secUid, dan followers bernilai 0, anggap akun tidak valid
  if (!parsedProfile || (!parsedProfile.avatar && !parsedProfile.id && parsedProfile.stats.followers === 0 && parsedProfile.stats.likes === 0)) {
    return {
      success: false,
      status: 'error',
      statusCode: 404,
      error: 'user_not_found',
      message: `Akun TikTok @${username} tidak ditemukan atau data publik tidak tersedia.`
    };
  }

  return {
    success: true,
    status: 'success',
    source: dataSource,
    timestamp: new Date().toISOString(),
    data: parsedProfile
  };
}
