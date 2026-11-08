// frontend/src/config/appVersion.js - Konfigurasi versi lokal & multi-layer persistence AllToolsKuro

export const LOCAL_APP_VERSION = '1.0.0';
export const LOCAL_VERSION_CODE = 1;
export const LATEST_TARGET_VERSION = '1.5.2';
export const LATEST_TARGET_CODE = 7;
export const APP_PACKAGE_ID = 'com.kuro.alltools';
export const APP_DISPLAY_NAME = 'AllToolsKuro';

const INSTALLED_VERSION_KEY = 'kuro_installed_app_version';
const INSTALLED_CODE_KEY = 'kuro_installed_version_code';

// Memory fallback untuk menjamin ketersediaan state jika webview mengisolasi storage
let memoryVersion = null;
let memoryCode = null;

function getCookie(name) {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
    return match ? decodeURIComponent(match[3]) : null;
  } catch {
    return null;
  }
}

function setCookie(name, value, days = 365) {
  if (typeof document === 'undefined') return;
  try {
    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAge};SameSite=Lax`;
  } catch (_) {}
}

// Ambil versi terpasang dari LocalStorage -> Cookie -> Memory -> Fallback Default
export function getInstalledAppVersion() {
  if (memoryVersion) return memoryVersion;
  if (typeof window === 'undefined') return LOCAL_APP_VERSION;

  try {
    const local = localStorage.getItem(INSTALLED_VERSION_KEY);
    if (local && local.trim()) {
      memoryVersion = local.trim();
      return memoryVersion;
    }
  } catch (_) {}

  const cookieVal = getCookie(INSTALLED_VERSION_KEY);
  if (cookieVal && cookieVal.trim()) {
    memoryVersion = cookieVal.trim();
    return memoryVersion;
  }

  return LOCAL_APP_VERSION;
}

// Simpan versi terpasang ke LocalStorage, Cookie, dan Memory secara persisten
export function setInstalledAppVersion(version) {
  if (!version) return;
  const clean = String(version).trim();
  memoryVersion = clean;

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(INSTALLED_VERSION_KEY, clean);
    } catch (err) {
      console.warn('[AppVersion] Gagal simpan ke localStorage:', err);
    }
    setCookie(INSTALLED_VERSION_KEY, clean);
  }
}

// Ambil kode versi terpasang
export function getInstalledVersionCode() {
  if (typeof memoryCode === 'number') return memoryCode;
  if (typeof window === 'undefined') return LOCAL_VERSION_CODE;

  try {
    const saved = localStorage.getItem(INSTALLED_CODE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed)) {
        memoryCode = parsed;
        return memoryCode;
      }
    }
  } catch (_) {}

  const cookieVal = getCookie(INSTALLED_CODE_KEY);
  if (cookieVal) {
    const parsed = parseInt(cookieVal, 10);
    if (!isNaN(parsed)) {
      memoryCode = parsed;
      return memoryCode;
    }
  }

  return LOCAL_VERSION_CODE;
}

// Simpan kode versi terpasang
export function setInstalledVersionCode(code) {
  if (code === undefined || code === null) return;
  const num = parseInt(code, 10);
  if (isNaN(num)) return;
  memoryCode = num;

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(INSTALLED_CODE_KEY, String(num));
    } catch (err) {
      console.warn('[AppVersion] Gagal simpan kode ke localStorage:', err);
    }
    setCookie(INSTALLED_CODE_KEY, String(num));
  }
}

// Fungsi pembanding nomor versi (Semantic Versioning)
export function isVersionHigher(remoteVersion, localVersion) {
  if (!remoteVersion || !localVersion) return false;
  
  const parsePart = (v) => v.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const rParts = parsePart(remoteVersion);
  const lParts = parsePart(localVersion);
  const maxLen = Math.max(rParts.length, lParts.length);

  for (let i = 0; i < maxLen; i++) {
    const r = rParts[i] || 0;
    const l = lParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}
