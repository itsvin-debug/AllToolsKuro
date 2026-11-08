// frontend/src/config/appVersion.js - Konfigurasi versi lokal aplikasi AllToolsKuro

export const LOCAL_APP_VERSION = '1.0.0';
export const LOCAL_VERSION_CODE = 1;
export const LATEST_TARGET_VERSION = '1.5.1';
export const LATEST_TARGET_CODE = 6;
export const APP_PACKAGE_ID = 'com.kuro.alltools';
export const APP_DISPLAY_NAME = 'AllToolsKuro';

const INSTALLED_VERSION_KEY = 'kuro_installed_app_version';
const INSTALLED_CODE_KEY = 'kuro_installed_version_code';

export function getInstalledAppVersion() {
  if (typeof window === 'undefined') return LOCAL_APP_VERSION;
  try {
    return localStorage.getItem(INSTALLED_VERSION_KEY) || LOCAL_APP_VERSION;
  } catch {
    return LOCAL_APP_VERSION;
  }
}

export function setInstalledAppVersion(version) {
  if (typeof window === 'undefined' || !version) return;
  try {
    localStorage.setItem(INSTALLED_VERSION_KEY, String(version).trim());
  } catch (err) {
    console.warn('[AppVersion] Gagal menyimpan versi aplikasi:', err);
  }
}

export function getInstalledVersionCode() {
  if (typeof window === 'undefined') return LOCAL_VERSION_CODE;
  try {
    const saved = localStorage.getItem(INSTALLED_CODE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return LOCAL_VERSION_CODE;
  } catch {
    return LOCAL_VERSION_CODE;
  }
}

export function setInstalledVersionCode(code) {
  if (typeof window === 'undefined' || code === undefined || code === null) return;
  try {
    localStorage.setItem(INSTALLED_CODE_KEY, String(code));
  } catch (err) {
    console.warn('[AppVersion] Gagal menyimpan kode versi aplikasi:', err);
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
